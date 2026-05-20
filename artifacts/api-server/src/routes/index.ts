import { Router, type IRouter } from "express";
import healthRouter from "./health";
import alertsRouter from "./alerts";
import airportsRouter from "./airports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(alertsRouter);
router.use(airportsRouter);

export default router;
