import { Router } from "express";
import nhanhRoutes from "./nhanh.routes";
import webhookRoutes from "./webhook.routes";
import dashboardRoutes from "./dashboard.routes";
import notificationRoutes from "./notification.routes";
import configRoutes from "./config.routes";
import authRoutes from "./auth.routes";
import { LogController } from "../controllers/log.controller";

const router = Router();

router.use("/", dashboardRoutes); // Mounts /inventory, /orders, /stats directly under /api
router.use("/notifications", notificationRoutes);
router.use("/settings", configRoutes);
router.use("/nhanh", nhanhRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/auth", authRoutes);
router.get("/logs", LogController.viewLogs);
router.get("/test", (req, res) => {
  res.json({ status: "ok" });
});





export default router;
