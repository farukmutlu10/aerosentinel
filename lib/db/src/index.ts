import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * In-memory fallback when PostgreSQL is not available.
 *
 * WARNING: This ONLY supports basic CRUD operations used by AeroSentinel.
 * Complex queries (joins, aggregations) will return empty results.
 * DO NOT rely on this in production — always provision a real PostgreSQL.
 */

// ── In-memory store ──────────────────────────────────────────
interface MemWatchlistEntry { id: number; userId: string; icao: string; addedAt: Date }
interface MemMonitorCacheEntry { icao: string; dataType: string; rawText: string; updatedAt: Date }
interface MemAlertEntry {
  id: number;
  type: string;
  icao: string;
  rawText: string;
  previousRawText: string | null;
  detectedAt: Date;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
}

interface MemPushSubscriptionEntry {
  id: number;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
}

const memStore: {
  watchlist: MemWatchlistEntry[];
  alerts: MemAlertEntry[];
  monitorCache: MemMonitorCacheEntry[];
  pushSubscriptions: MemPushSubscriptionEntry[];
} = { watchlist: [], alerts: [], monitorCache: [], pushSubscriptions: [] };
let memNextId = { wl: 1, alert: 1, pushSub: 1 };

/**
 * Creates a lightweight thenable query-builder surrogate for the in-memory
 * fallback.  It mimics a tiny subset of Drizzle's chainable API.
 */
function memQuery<T>(result: T[] = [], table?: any) {
  const q = Promise.resolve(result) as any;
  q.where = (condition?: any) => {
    if (!condition || !table) return memQuery(result, table);
    const constraints = collectConstraints(condition);
    return memQuery(result.filter((row) => rowMatchesConstraints(row, constraints, table)), table);
  };
  q.orderBy = () => memQuery(result, table);
  q.groupBy = () => memQuery(result, table);
  q.limit = (n: number) => memQuery(result.slice(0, n), table);
  q.offset = (n: number) => memQuery(result.slice(n), table);
  return q;
}

/** Extract the table name from a Drizzle table object. */
function tableName(table: any): string {
  // Modern Drizzle ORM stores table name under Symbol.for('drizzle:Name')
  return table?.[Symbol.for("drizzle:Name")] ?? table?._?.name ?? table?._?.tableName ?? "";
}

interface LeafConstraint { column: string; op: string; value: unknown }

/**
 * Recursively flattens a Drizzle condition (eq/inArray/like/gte/and/...) into
 * a list of (dbColumnName, operator, value) leaf constraints, by walking the
 * internal `queryChunks` SQL AST. Sub-conditions nested via `and()`/`or()`
 * (themselves SQL objects with their own `queryChunks`) are recursed into.
 * Leaves that can't be confidently interpreted (e.g. raw `sql\`...\`` template
 * fragments like "NOW() - INTERVAL '24 hours'") are simply skipped — callers
 * treat unparsed constraints as non-restrictive rather than guessing wrong.
 */
function collectConstraints(cond: any, out: LeafConstraint[] = []): LeafConstraint[] {
  const chunks: any[] = cond?.queryChunks ?? [];
  let column: string | undefined;
  let op = "=";
  let value: unknown;
  let hasValue = false;

  for (const chunk of chunks) {
    if (chunk == null) continue;

    if (typeof chunk === "string") {
      value = chunk; hasValue = true; // like() pattern is a raw string chunk
    } else if (Array.isArray(chunk)) {
      // inArray() value list — each element may itself be a Param wrapper
      // (Drizzle wraps individual elements, e.g. for a single-item array).
      value = chunk.map((el) =>
        el && typeof el === "object" && "encoder" in el && "value" in el ? (el as any).value : el,
      );
      hasValue = true;
    } else if (typeof chunk === "object") {
      if (Array.isArray(chunk.queryChunks)) {
        collectConstraints(chunk, out); // nested and()/or() — recurse
      } else if (typeof chunk.name === "string" && "columnType" in chunk) {
        column = chunk.name; // Column reference (DB column name, e.g. "user_id")
      } else if (Array.isArray(chunk.value) && typeof chunk.value[0] === "string") {
        const opStr = chunk.value[0].trim().toLowerCase();
        if (opStr) op = opStr; // operator StringChunk: " = ", " in ", " like ", " >= ", ...
      } else if ("encoder" in chunk && "value" in chunk) {
        value = chunk.value; hasValue = true; // Param wrapper (eq/gte/... scalar value)
      }
    }
  }

  if (column && hasValue) out.push({ column, op, value });
  return out;
}

/** Reverse-lookup: find the JS/TS property key on `table` whose column `.name` matches `dbName`. */
function jsKeyForColumn(table: any, dbName: string): string | undefined {
  for (const [key, col] of Object.entries(table ?? {})) {
    if (col && typeof col === "object" && (col as any).name === dbName) return key;
  }
  return undefined;
}

function toComparable(v: unknown): number | string {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return v as number | string;
}

/** Evaluates a flattened constraint list (AND semantics) against a single in-memory row. */
function rowMatchesConstraints(row: any, constraints: LeafConstraint[], table: any): boolean {
  return constraints.every(({ column, op, value }) => {
    const jsKey = jsKeyForColumn(table, column);
    if (!jsKey) return true; // unknown column — don't restrict
    const rowVal = row[jsKey];
    switch (op) {
      case "=": return toComparable(rowVal) === toComparable(value);
      case "<>": return toComparable(rowVal) !== toComparable(value);
      case "in": return Array.isArray(value) && value.some((v) => toComparable(v) === toComparable(rowVal));
      case "like": {
        const pattern = String(value).replace(/%/g, "").trim();
        return String(rowVal ?? "").includes(pattern);
      }
      case ">=": return toComparable(rowVal) >= toComparable(value);
      case ">": return toComparable(rowVal) > toComparable(value);
      case "<=": return toComparable(rowVal) <= toComparable(value);
      case "<": return toComparable(rowVal) < toComparable(value);
      default: return true; // unrecognized operator (e.g. raw sql`` fragment) — don't restrict
    }
  });
}

function memDb() {
  return {
    select: () => ({
      from: (table: any) => {
        const t = tableName(table);
        if (t === "monitor_cache")      return memQuery([...memStore.monitorCache], table);
        if (t === "watchlist")          return memQuery([...memStore.watchlist], table);
        if (t === "alerts")             return memQuery([...memStore.alerts], table);
        if (t === "push_subscriptions") return memQuery([...memStore.pushSubscriptions], table);
        return memQuery([], table);
      },
    }),
    insert: (table: any) => ({
      values: (v: any) => {
        const t = tableName(table);
        const arr = Array.isArray(v) ? v : [v];

        /** Execute the actual insert based on table name. */
        const doInsert = () => {
          if (t === "watchlist") {
            for (const item of arr) {
              if (item.icao && !memStore.watchlist.find((r) => r.icao === item.icao && r.userId === (item.userId ?? "legacy"))) {
                memStore.watchlist.push({
                  id: memNextId.wl++,
                  userId: item.userId ?? "legacy",
                  icao: item.icao,
                  addedAt: new Date(),
                });
              }
            }
          } else if (t === "monitor_cache") {
            for (const item of arr) {
              if (item.icao && item.dataType) {
                const existing = memStore.monitorCache.find(
                  (r) => r.icao === item.icao && r.dataType === item.dataType,
                );
                if (existing) {
                  existing.rawText = item.rawText ?? existing.rawText;
                  existing.updatedAt = new Date();
                } else {
                  memStore.monitorCache.push({
                    icao: item.icao,
                    dataType: item.dataType,
                    rawText: item.rawText ?? "",
                    updatedAt: new Date(),
                  });
                }
              }
            }
          } else if (t === "alerts") {
            for (const item of arr) {
              memStore.alerts.push({
                id: memNextId.alert++,
                type: item.type ?? "TAF_AMD",
                icao: item.icao ?? "",
                rawText: item.rawText ?? "",
                previousRawText: item.previousRawText ?? null,
                detectedAt: new Date(),
                acknowledged: false,
                acknowledgedAt: null,
              });
            }
          } else if (t === "push_subscriptions") {
            for (const item of arr) {
              const existing = memStore.pushSubscriptions.find((r) => r.endpoint === item.endpoint);
              if (existing) {
                existing.p256dh = item.p256dh ?? existing.p256dh;
                existing.auth = item.auth ?? existing.auth;
                existing.userId = item.userId ?? existing.userId;
              } else {
                memStore.pushSubscriptions.push({
                  id: memNextId.pushSub++,
                  userId: item.userId ?? "legacy",
                  endpoint: item.endpoint ?? "",
                  p256dh: item.p256dh ?? "",
                  auth: item.auth ?? "",
                  createdAt: new Date(),
                });
              }
            }
          }
        };

        return {
          // Make thenable so bare `await db.insert(table).values(...)` works
          then: (resolve: any, reject: any) => {
            doInsert();
            return Promise.resolve().then(resolve, reject);
          },
          onConflictDoNothing: () => {
            if (t === "watchlist") {
              for (const item of arr) {
                if (item.icao && !memStore.watchlist.find((r) => r.icao === item.icao && r.userId === (item.userId ?? "legacy"))) {
                  memStore.watchlist.push({
                    id: memNextId.wl++,
                    userId: item.userId ?? "legacy",
                    icao: item.icao,
                    addedAt: new Date(),
                  });
                }
              }
            }
            return Promise.resolve();
          },
          onConflictDoUpdate: (_opts: any) => {
            if (t === "monitor_cache") {
              for (const item of arr) {
                if (item.icao && item.dataType) {
                  const existing = memStore.monitorCache.find(
                    (r) => r.icao === item.icao && r.dataType === item.dataType,
                  );
                  if (existing) {
                    existing.rawText = item.rawText ?? existing.rawText;
                    existing.updatedAt = new Date();
                  } else {
                    memStore.monitorCache.push({
                      icao: item.icao,
                      dataType: item.dataType,
                      rawText: item.rawText ?? "",
                      updatedAt: new Date(),
                    });
                  }
                }
              }
            }
            return Promise.resolve();
          },
          returning: () => {
            doInsert();
            return Promise.resolve(arr);
          },
        };
      },
    }),
    update: (table: any) => ({
      set: (values: any) => ({
        where: (condition: any) => {
          const t = tableName(table);
          if (t === "alerts") {
            const constraints = collectConstraints(condition);
            const updated: MemAlertEntry[] = [];
            for (const alert of memStore.alerts) {
              if (rowMatchesConstraints(alert, constraints, table)) {
                Object.assign(alert, values);
                updated.push(alert);
              }
            }
            return {
              returning: () => Promise.resolve(updated),
              then: (resolve: any, reject: any) => Promise.resolve(updated).then(resolve, reject),
            };
          }
          return {
            then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
            returning: () => Promise.resolve([]),
          };
        },
      }),
    }),
    delete: (table: any) => {
      const t = tableName(table);
      const storeKey: keyof typeof memStore | undefined =
        t === "alerts" ? "alerts"
        : t === "watchlist" ? "watchlist"
        : t === "push_subscriptions" ? "pushSubscriptions"
        : t === "monitor_cache" ? "monitorCache"
        : undefined;
      const fn: any = () => {
        if (storeKey) (memStore as any)[storeKey] = [];
        else { memStore.watchlist = []; memStore.alerts = []; memStore.monitorCache = []; memStore.pushSubscriptions = []; }
        return Promise.resolve();
      };
      fn.where = (condition: any) => {
        if (storeKey) {
          const constraints = condition ? collectConstraints(condition) : [];
          (memStore as any)[storeKey] = (memStore as any)[storeKey].filter(
            (row: any) => !rowMatchesConstraints(row, constraints, table),
          );
        }
        return Promise.resolve();
      };
      return fn;
    },
  };
}

// ── Resolve DATABASE_URL with fallback chain ──────────────────
const DB_URL_CANDIDATES = [
  "DATABASE_URL",
  "DATABASE_PRIVATE_URL",
  "POSTGRES_URL",
  "POSTGRESQL_URL",
];

function resolveDatabaseUrl(): string | undefined {
  // Diagnostic: log which DB-related env vars exist (names only, no values for security)
  const present: string[] = [];
  const empty: string[] = [];
  for (const name of DB_URL_CANDIDATES) {
    const val = process.env[name];
    if (val === undefined) {
      // not set at all
    } else if (val === "") {
      empty.push(name);
    } else {
      present.push(name);
    }
  }
  // Also check PG* vars
  const pgVars = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"];
  const pgPresent = pgVars.filter((v) => !!process.env[v]);

  console.log("[db] Env var scan:", JSON.stringify({ present, empty, pgPresent }));

  // 1. Try candidates in order
  for (const name of DB_URL_CANDIDATES) {
    const val = process.env[name];
    if (val) {
      if (name !== "DATABASE_URL") {
        console.log(`[db] ⚠️ DATABASE_URL not found — using fallback: ${name}`);
      }
      return val;
    }
  }

  // 2. Try constructing from individual PG* vars
  if (process.env["PGHOST"] && process.env["PGDATABASE"]) {
    const user = process.env["PGUSER"] ?? "postgres";
    const pass = process.env["PGPASSWORD"] ? `:${process.env["PGPASSWORD"]}` : "";
    const host = process.env["PGHOST"];
    const port = process.env["PGPORT"] ? `:${process.env["PGPORT"]}` : ":5432";
    const db2 = process.env["PGDATABASE"];
    const constructed = `postgresql://${user}${pass}@${host}${port}/${db2}`;
    console.log("[db] ⚠️ Constructed DATABASE_URL from PG* variables");
    return constructed;
  }

  // 3. Nothing found
  if (empty.length > 0) {
    console.error(
      `[db] ❌ ${empty.join(", ")} is SET but EMPTY — this usually means a Railway variable reference ` +
      `(\${{...}}) is not resolving. Check that the PostgreSQL service is linked to this service in Railway Dashboard.`
    );
  }
  return undefined;
}

// Typed as the real Drizzle client everywhere — every call site in this codebase
// is written against the full Drizzle query-builder API. The in-memory fallback
// (memDb()) only duck-types the subset actually used at runtime; it is cast below
// since matching Drizzle's full generic surface would add complexity with no
// runtime benefit (that fallback is dev-only, see warning at its call site).
let db: ReturnType<typeof drizzle>;
let pool: pg.Pool | null = null;

const resolvedDbUrl = resolveDatabaseUrl();

if (resolvedDbUrl) {
  pool = new Pool({
    connectionString: resolvedDbUrl,
    connectionTimeoutMillis: 15_000, // 15s timeout — prevent infinite hangs when DB is unreachable
    idleTimeoutMillis: 30_000,
  });
  db = drizzle(pool, { schema });
  console.log(
    "[db] Connected to PostgreSQL:",
    String(resolvedDbUrl).replace(/\/\/.*@/, "//***@"),
  );
} else {
  db = memDb() as unknown as ReturnType<typeof drizzle>;
  pool = null;
  console.error(
    "[db] ❌ DATABASE_URL not set — using in-memory fallback.\n" +
    "     ⚠️ Data will NOT persist across restarts. Only LTFH will be monitored.\n" +
    "     Fix: Set DATABASE_URL in Railway Dashboard → Service → Variables.\n" +
    "     If using PostgreSQL plugin, ensure it is LINKED to this service."
  );
}

export { db, pool, memStore };
export * from "./schema";
export * from "./migrations.js";
