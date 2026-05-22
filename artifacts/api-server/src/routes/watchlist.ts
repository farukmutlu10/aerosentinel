import { Router } from "express";
import { db, watchlistTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchWeatherForIcao } from "../lib/monitor.js";

const router = Router();

router.get("/watchlist", async (_req, res) => {
  const rows = await db.select({ icao: watchlistTable.icao }).from(watchlistTable).orderBy(watchlistTable.addedAt);
  return res.json(rows.map((r) => r.icao));
});

router.post("/watchlist", async (req, res) => {
  const icao = ((req.body?.icao as string) ?? "").trim().toUpperCase();
  if (!icao || icao.length < 2 || icao.length > 6) {
    return res.status(400).json({ error: "Invalid ICAO code" });
  }
  await db.insert(watchlistTable).values({ icao }).onConflictDoNothing();
  return res.json({ ok: true, icao });
});

router.delete("/watchlist", async (_req, res) => {
  await db.delete(watchlistTable);
  return res.json({ ok: true });
});

router.delete("/watchlist/:icao", async (req, res) => {
  const icao = req.params.icao?.toUpperCase();
  await db.delete(watchlistTable).where(eq(watchlistTable.icao, icao));
  return res.json({ ok: true, icao });
});

router.get("/watchlist/weather", async (req, res) => {
  const icaosParam = ((req.query.icaos as string) ?? "").trim();
  const icaos = icaosParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length >= 2 && s.length <= 6);

  const list = icaos.length > 0 ? icaos : ["LTFH"];

  const results = await Promise.all(
    list.map(async (icao) => ({
      icao,
      ...(await fetchWeatherForIcao(icao)),
    }))
  );
  return res.json(results);
});

export default router;
