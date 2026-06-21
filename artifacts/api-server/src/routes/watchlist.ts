import { Router } from "express";
import { db, watchlistTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fetchWeatherForIcao, updateCachedIcaos, getAirports } from "../lib/monitor.js";

const router = Router();

function getDeviceId(req: Express.Request): string {
  return (req.headers["x-device-id"] as string) ?? "legacy";
}

router.get("/watchlist", async (req, res) => {
  const userId = getDeviceId(req);
  const rows = await db
    .select({ icao: watchlistTable.icao })
    .from(watchlistTable)
    .where(eq(watchlistTable.userId, userId))
    .orderBy(watchlistTable.addedAt);
  return res.json(rows.map((r) => r.icao));
});

router.post("/watchlist", async (req, res) => {
  const userId = getDeviceId(req);
  const icao = ((req.body?.icao as string) ?? "").trim().toUpperCase();
  if (!icao || icao.length < 2 || icao.length > 6) {
    return res.status(400).json({ error: "Invalid ICAO code" });
  }
  await db.insert(watchlistTable).values({ icao, userId }).onConflictDoNothing();
  // Immediately add to monitor's in-memory list so next scan covers it
  const current = getAirports();
  if (!current.includes(icao)) {
    updateCachedIcaos([...current, icao]);
  }
  return res.json({ ok: true, icao });
});

router.delete("/watchlist", async (req, res) => {
  const userId = getDeviceId(req);
  await db.delete(watchlistTable).where(eq(watchlistTable.userId, userId));
  return res.json({ ok: true });
});

// Replace entire watchlist with the given list (browser sync on mount)
router.put("/watchlist/sync", async (req, res) => {
  const userId = getDeviceId(req);
  const raw = req.body?.icaos;
  const icaos: string[] = Array.isArray(raw)
    ? raw.map((s: unknown) => String(s).trim().toUpperCase()).filter((s) => s.length >= 2 && s.length <= 6)
    : [];
  await db.delete(watchlistTable).where(eq(watchlistTable.userId, userId));
  if (icaos.length > 0) {
    await db.insert(watchlistTable).values(icaos.map((icao) => ({ icao, userId }))).onConflictDoNothing();
  }
  updateCachedIcaos(icaos.length > 0 ? icaos : ["LTFH"]);
  return res.json({ ok: true, icaos });
});

router.delete("/watchlist/:icao", async (req, res) => {
  const userId = getDeviceId(req);
  const icao = req.params.icao?.toUpperCase();
  await db.delete(watchlistTable).where(and(eq(watchlistTable.icao, icao), eq(watchlistTable.userId, userId)));
  return res.json({ ok: true, icao });
});

router.get("/watchlist/weather", async (req, res) => {
  const userId = getDeviceId(req);
  const icaosParam = ((req.query.icaos as string) ?? "").trim();
  const icaos = icaosParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length >= 2 && s.length <= 6);

  // If no icaos param, fetch from this user's watchlist
  let list: string[];
  if (icaos.length > 0) {
    list = icaos;
  } else {
    const rows = await db
      .select({ icao: watchlistTable.icao })
      .from(watchlistTable)
      .where(eq(watchlistTable.userId, userId));
    list = rows.length > 0 ? rows.map((r) => r.icao) : ["LTFH"];
  }

  const results = await Promise.all(
    list.map(async (icao) => ({
      icao,
      ...(await fetchWeatherForIcao(icao)),
    }))
  );
  return res.json(results);
});

export default router;
