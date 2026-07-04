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
  detectedAt: Date;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
}

const memStore: {
  watchlist: MemWatchlistEntry[];
  alerts: MemAlertEntry[];
  monitorCache: MemMonitorCacheEntry[];
} = { watchlist: [], alerts: [], monitorCache: [] };
let memNextId = { wl: 1, alert: 1 };

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
        if (t === "monitor_cache") return memQuery([...memStore.monitorCache]);
        if (t === "watchlist")     return memQuery([...memStore.watchlist]);
        if (t === "alerts")        return memQuery([...memStore.alerts]);
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
                detectedAt: new Date(),
                acknowledged: false,
                acknowledgedAt: null,
              });
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
    delete: (_table: any) => {
      const fn: any = () => {
        memStore.watchlist = [];
        memStore.alerts = [];
        memStore.monitorCache = [];
        return Promise.resolve();
      };
      fn.where = () => {
        memStore.watchlist = [];
        return Promise.resolve();
      };
      return fn;
    },
  };
}

let db: ReturnType<typeof drizzle> | ReturnType<typeof memDb>;
let pool: pg.Pool | null = null;

if (process.env["DATABASE_URL"]) {
  pool = new Pool({
    connectionString: process.env["DATABASE_URL"],
    connectionTimeoutMillis: 15_000, // 15s timeout — prevent infinite hangs when DB is unreachable
    idleTimeoutMillis: 30_000,
  });
  db = drizzle(pool, { schema });
  console.log(
    "[db] Connected to PostgreSQL:",
    String(process.env["DATABASE_URL"]).replace(/\/\/.*@/, "//***@"),
  );
} else {
  db = memDb();
  pool = null;
  console.log("[db] DATABASE_URL not set — using in-memory fallback");
}

export { db, pool, memStore };
export * from "./schema";
