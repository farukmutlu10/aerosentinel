import { Router } from "express";
import { fetchWeatherForIcao } from "../lib/monitor.js";

const router = Router();

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
