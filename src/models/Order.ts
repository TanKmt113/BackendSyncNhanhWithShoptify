import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class Order extends Model {
  public id!: number;
  public shopify_order_id!: string;
  public nhanh_order_id!: string | null;
  public status!: "SUCCESS" | "FAILED";
  public error_message!: string | null;
}

Order.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    shopify_order_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nhanh_order_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("SUCCESS", "FAILED"),
      defaultValue: "SUCCESS",
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "orders",
  }
);

export default Order;
