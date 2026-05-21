import { Router } from "express";
import { db, watchlistTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchWeatherForIcao } from "../lib/monitor.js";

const router = Router();

router.get("/watchlist", async (_req, res) => {
  const entries = await db.select().from(watchlistTable).orderBy(watchlistTable.addedAt);
  return res.json(entries);
});

router.post("/watchlist", async (req, res) => {
  const icao = (req.body?.icao ?? "").toString().trim().toUpperCase();
  if (!icao || icao.length < 2 || icao.length > 6) {
    return res.status(400).json({ error: "Invalid ICAO" });
  }
  try {
    const [entry] = await db
      .insert(watchlistTable)
      .values({ icao })
      .onConflictDoNothing()
      .returning();
    const existing = entry ?? (await db.select().from(watchlistTable).where(eq(watchlistTable.icao, icao)))[0];
    return res.status(201).json(existing);
  } catch {
    return res.status(500).json({ error: "Failed to add airport" });
  }
});

router.delete("/watchlist/all", async (_req, res) => {
  await db.delete(watchlistTable);
  return res.json({ ok: true });
});

router.delete("/watchlist/:icao", async (req, res) => {
  const icao = req.params.icao?.toUpperCase();
  await db.delete(watchlistTable).where(eq(watchlistTable.icao, icao));
  return res.json({ ok: true });
});

router.get("/watchlist/weather", async (_req, res) => {
  const entries = await db.select().from(watchlistTable).orderBy(watchlistTable.addedAt);
  const icaos = entries.length > 0 ? entries.map((e) => e.icao) : ["LTFH"];
  const results = await Promise.all(
    icaos.map(async (icao) => ({
      icao,
      ...(await fetchWeatherForIcao(icao)),
    }))
  );
  return res.json(results);
});

export default router;
