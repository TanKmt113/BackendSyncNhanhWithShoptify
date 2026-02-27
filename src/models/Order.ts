import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class Order extends Model {
  public id!: number;
  public shopify_order_id!: string;
  public nhanh_order_id!: string | null;
  public status!: "SUCCESS" | "FAILED";
  public error_message!: string | null;
  public order_data!: any | null;
  public shipping_address!: any | null;
  public line_items!: any | null;
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
      // unique constraint đã được tạo qua migration, không cần ở đây
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
    order_data: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Full order data from Shopify webhook",
    },
    shipping_address: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Shipping address from Shopify order",
    },
    line_items: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Product line items from Shopify order",
    },
  },
  {
    sequelize,
    tableName: "orders",
  }
);

export default Order;
