import { Router } from "express";
import nhanhRoutes from "./nhanh.routes";
import webhookRoutes from "./webhook.routes";
import dashboardRoutes from "./dashboard.routes";
import syncRoutes from "./sync.routes";
import notificationRoutes from "./notification.routes";
import configRoutes from "./config.routes";
import authRoutes from "./auth.routes";
import logoRoutes from "./logo.routes";
import { LogController } from "../controllers/log.controller";

const router = Router();
router.use("/", dashboardRoutes);
router.use("/sync", syncRoutes);
router.use("/notifications", notificationRoutes);
router.use("/settings", configRoutes);
router.use("/nhanh", nhanhRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/auth", authRoutes);
router.use("/logo", logoRoutes);
router.get("/logs", LogController.viewLogs);

export default router;
