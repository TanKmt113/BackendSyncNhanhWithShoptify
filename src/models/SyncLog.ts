import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class SyncLog extends Model {
  public id!: number;
  public type!: string;
  public request_payload!: any;
  public response_payload!: any;
  public status!: "SUCCESS" | "FAILED";
}

SyncLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    type: {
        type: DataTypes.STRING, // e.g., 'WEBHOOK_ORDER', 'SYNC_INVENTORY'
        allowNull: false
    },
    request_payload: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    response_payload: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("SUCCESS", "FAILED"),
      defaultValue: "SUCCESS",
    },
  },
  {
    sequelize,
    tableName: "sync_logs",
  }
);

export default SyncLog;
