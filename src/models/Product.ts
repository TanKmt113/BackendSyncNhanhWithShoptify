import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class Product extends Model {
  public id!: number;
  public nhanh_id!: string;
  public sku_nhanh!: string;
  public sku_shopify!: string | null;
  public name!: string;
  public image!: string | null;
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
  },
  {
    sequelize,
    tableName: "products",
  }
);

export default Product;
