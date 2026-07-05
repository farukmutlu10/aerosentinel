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
function memQuery<T>(result: T[] = []) {
  const q = Promise.resolve(result) as any;
  q.where = () => memQuery(result);
  q.orderBy = () => memQuery(result);
  q.groupBy = () => memQuery(result);
  q.limit = (n: number) => memQuery(result.slice(0, n));
  q.offset = (n: number) => memQuery(result.slice(n));
  return q;
}

/** Extract the table name from a Drizzle table object. */
function tableName(table: any): string {
  // Modern Drizzle ORM stores table name under Symbol.for('drizzle:Name')
  return table?.[Symbol.for("drizzle:Name")] ?? table?._?.name ?? table?._?.tableName ?? "";
}

/**
 * Try to extract the comparison value from a Drizzle `eq()` expression.
 * Walks `queryChunks` looking for `Param` wrapper objects that have a
 * `.value` property but no `.name` (which would indicate a Column).
 */
function extractEqValue(cond: any): any {
  try {
    const chunks: any[] = cond?.queryChunks ?? [];
    for (const chunk of chunks) {
      if (chunk && typeof chunk === "object" && "value" in chunk && !("name" in chunk)) {
        return chunk.value;
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

function memDb() {
  return {
    select: () => ({
      from: (table: any) => {
        const t = tableName(table);
        if (t === "monitor_cache")      return memQuery([...memStore.monitorCache]);
        if (t === "watchlist")          return memQuery([...memStore.watchlist]);
        if (t === "alerts")             return memQuery([...memStore.alerts]);
        if (t === "push_subscriptions") return memQuery([...memStore.pushSubscriptions]);
        return memQuery([]);
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
          if (t === "alerts" && values.acknowledged === true) {
            // Try to detect id-based filter vs column-based filter
            const condVal = extractEqValue(condition);
            let updated: MemAlertEntry[] = [];

            if (typeof condVal === "number") {
              // Single alert by id: eq(alertsTable.id, id)
              const alert = memStore.alerts.find((a) => a.id === condVal);
              if (alert) {
                alert.acknowledged = true;
                alert.acknowledgedAt = values.acknowledgedAt ?? new Date();
                updated = [alert];
              }
            } else {
              // Acknowledge all unacknowledged: eq(alertsTable.acknowledged, false)
              for (const alert of memStore.alerts) {
                if (!alert.acknowledged) {
                  alert.acknowledged = true;
                  alert.acknowledgedAt = values.acknowledgedAt ?? new Date();
                  updated.push(alert);
                }
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
      const fn: any = () => {
        if (t === "alerts") { memStore.alerts = []; }
        else if (t === "watchlist") { memStore.watchlist = []; }
        else if (t === "push_subscriptions") { memStore.pushSubscriptions = []; }
        else { memStore.watchlist = []; memStore.alerts = []; memStore.monitorCache = []; memStore.pushSubscriptions = []; }
        return Promise.resolve();
      };
      fn.where = (condition: any) => {
        if (t === "alerts" && condition) {
          // Try to extract a "like" or "includes" pattern from the condition
          const condStr = String(condition);
          const likeMatch = condStr.match(/%(\w+)%/);
          if (likeMatch) {
            const pattern = likeMatch[1];
            memStore.alerts = memStore.alerts.filter((a) => !a.rawText.includes(pattern));
          } else {
            // Try to extract eq value for type/icao based filtering
            const condVal = extractEqValue(condition);
            if (condVal !== undefined) {
              memStore.alerts = memStore.alerts.filter((a) => a.type !== condVal && a.icao !== condVal);
            }
          }
        } else if (t === "watchlist") {
          memStore.watchlist = [];
        } else if (t === "push_subscriptions") {
          const condVal = extractEqValue(condition);
          if (condVal !== undefined) {
            memStore.pushSubscriptions = memStore.pushSubscriptions.filter((s) => s.endpoint !== condVal && s.userId !== condVal);
          } else {
            memStore.pushSubscriptions = [];
          }
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

let db: ReturnType<typeof drizzle> | ReturnType<typeof memDb>;
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
  db = memDb();
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
