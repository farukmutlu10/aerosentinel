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
interface MemWatchlistEntry { id: number; icao: string; addedAt: Date }
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
} = { watchlist: [], alerts: [] };
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

function memDb() {
  return {
    select: () => ({
      from: () => memQuery([]),
    }),
    insert: (_table: string) => ({
      values: (v: any) => ({
        onConflictDoNothing: () => {
          const arr = Array.isArray(v) ? v : [v];
          for (const item of arr) {
            if (item.icao && !memStore.watchlist.find((r) => r.icao === item.icao)) {
              memStore.watchlist.push({
                id: memNextId.wl++,
                icao: item.icao,
                addedAt: new Date(),
              });
            }
          }
          return Promise.resolve();
        },
        returning: () => Promise.resolve(Array.isArray(v) ? v : [v]),
      }),
    }),
    update: (_table: string) => ({
      set: (_values: any) => ({
        where: (_condition: any) => Promise.resolve([]),
      }),
    }),
    delete: (_table: string) => {
      const fn: any = () => {
        memStore.watchlist = [];
        memStore.alerts = [];
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
  pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
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
