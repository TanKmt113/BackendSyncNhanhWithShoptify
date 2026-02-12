import { Router } from "express";
import { NotificationController } from "../controllers/notification.controller";

const router = Router();

router.get("/", NotificationController.getNotifications);
router.put("/read-all", NotificationController.markAllAsRead);
router.put("/:id/read", NotificationController.markAsRead);
router.delete("/read", NotificationController.deleteReadNotifications);

export default router;
