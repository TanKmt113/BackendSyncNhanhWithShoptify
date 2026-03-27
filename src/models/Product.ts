import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class Product extends Model {
  public id!: number;
  public nhanh_id!: string;
  public sku_nhanh!: string;
  public sku_shopify!: string | null;
  public name!: string;
  public image!: string | null;
  public nhanh_stock!: number;
  public shopify_stock!: number;
  public inventory_status!: "MATCH" | "MISMATCH";
  public syncStatus!: "SYNCED" | "NOT_SYNCED";
  public createdAt!: Date;
  public updatedAt!: Date;
}

Product.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    nhanh_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true, // Đảm bảo mỗi sản phẩm từ Nhanh.vn chỉ có 1 bản ghi
    },
    sku_nhanh: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sku_shopify: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    nhanh_stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    shopify_stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    inventory_status: {
      type: DataTypes.ENUM("MATCH", "MISMATCH"),
      defaultValue: "MATCH",
    },
    syncStatus: {
      type: DataTypes.ENUM("SYNCED", "NOT_SYNCED"),
      defaultValue: "NOT_SYNCED",
    },
  },
  {
    sequelize,
    tableName: "products",
  }
);

export default Product;
