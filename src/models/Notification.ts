import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class Notification extends Model {
  public id!: number;
  public type!: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  public message!: string;
  public is_read!: boolean;
}

Notification.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM("INFO", "SUCCESS", "WARNING", "ERROR"),
      defaultValue: "INFO",
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: "notifications",
  }
);

export default Notification;
