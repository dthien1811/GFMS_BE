import express from "express";
import metricController from "../../controllers/member/metric.controller";

const router = express.Router();

router.get("/", metricController.getMyMetrics);
router.get("/latest", metricController.getLatestMetric);
router.post("/", metricController.createMetric);

export default router;