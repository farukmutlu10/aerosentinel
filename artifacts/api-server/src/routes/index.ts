import { Router, type IRouter } from "express";
import healthRouter from "./health";
import alertsRouter from "./alerts";
import airportsRouter from "./airports";
import watchlistRouter from "./watchlist";
import pushRouter from "./push";
import teamsRouter from "./teams";

const router: IRouter = Router();

router.use(healthRouter);
router.use(alertsRouter);
router.use(watchlistRouter);
router.use(airportsRouter);
router.use(pushRouter);
router.use(teamsRouter);

export default router;
