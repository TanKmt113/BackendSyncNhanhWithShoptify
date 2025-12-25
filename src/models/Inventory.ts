import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class Inventory extends Model {
  public id!: number;
  public product_id!: number;
  public nhanh_stock!: number;
  public shopify_stock!: number;
  public status!: "MATCH" | "MISMATCH";
}

Inventory.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    nhanh_stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    shopify_stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM("MATCH", "MISMATCH"),
      defaultValue: "MATCH",
    },
  },
  {
    sequelize,
    tableName: "inventory",
  }
);

export default Inventory;
