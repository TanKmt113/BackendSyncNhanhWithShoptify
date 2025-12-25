import { Request, Response } from "express";
import { Notification } from "../models";
import { getIO } from "../utils/socket";

export class NotificationController {
  
  // Lấy danh sách thông báo (mới nhất trước)
  static async getNotifications(req: Request, res: Response) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const notifications = await Notification.findAll({
        order: [['createdAt', 'DESC']],
        limit: limit
      });
      
      const unreadCount = await Notification.count({ where: { is_read: false } });

      res.json({
        data: notifications,
        unread: unreadCount
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Đánh dấu tất cả là đã đọc
  static async markAllAsRead(req: Request, res: Response) {
    try {
      await Notification.update({ is_read: true }, { where: { is_read: false } });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Đánh dấu 1 thông báo là đã đọc
  static async markAsRead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await Notification.update({ is_read: true }, { where: { id: id } });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Hàm helper nội bộ để tạo thông báo từ các Service khác
  static async createSystemNotification(type: "INFO" | "SUCCESS" | "WARNING" | "ERROR", message: string) {
      try {
          const notif = await Notification.create({ type, message });
          
          // Bắn socket realtime ngay khi tạo
          try {
             const io = getIO();
             // Sử dụng toJSON() để đảm bảo cấu trúc dữ liệu gửi qua socket
             // hoàn toàn giống với cấu trúc trả về từ API (loại bỏ metadata của Sequelize)
             io.emit("new_notification", notif.toJSON());
          } catch (e) {
              console.warn("Socket not init yet or error emitting", e);
          }
          
          return notif;
      } catch (error) {
          console.error("Failed to create notification", error);
      }
  }
}
