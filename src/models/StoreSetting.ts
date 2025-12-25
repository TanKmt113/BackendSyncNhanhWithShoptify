import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { encrypt, decrypt } from "../utils/crypto";

class StoreSetting extends Model {
  public id!: number;
  public shop_name!: string;
  public shopify_admin_api!: string;
  public shopify_api_key!: string;
  public shopify_api_secret!: string;
  public shopify_webhook_secret!: string;
  public shopify_api_version!: string;
  
  public nhanh_app_id!: string;
  public nhanh_app_token!: string;
  public nhanh_business_id!: string;
  public nhanh_secret_key!: string;
  public nhanh_api_url!: string;
}

StoreSetting.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    shop_name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      defaultValue: "default" 
    },
    // Shopify Configs
    shopify_admin_api: {
        type: DataTypes.STRING,
        allowNull: true
    },
    shopify_api_key: {
        type: DataTypes.STRING,
        allowNull: true
    },
    shopify_api_secret: {
        type: DataTypes.TEXT, // Store encrypted
        allowNull: true,
        // Sequelize Hooks có thể dùng để encrypt/decrypt tự động, 
        // nhưng để rõ ràng và kiểm soát luồng, ta sẽ xử lý ở Service/Controller.
        // Tuy nhiên, việc dùng getter/setter ảo là cách hay.
        // Ở đây tôi giữ đơn giản là TEXT.
    },
    shopify_webhook_secret: {
        type: DataTypes.TEXT, // Store encrypted
        allowNull: true
    },
    shopify_api_version: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "2024-01"
    },
    // Nhanh Configs
    nhanh_app_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    nhanh_app_token: {
        type: DataTypes.TEXT, // Store encrypted
        allowNull: true
    },
    nhanh_business_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    nhanh_secret_key: {
        type: DataTypes.TEXT, // Store encrypted
        allowNull: true
    },
    nhanh_api_url: {
        type: DataTypes.STRING,
        allowNull: true
    }
  },
  {
    sequelize,
    tableName: "store_settings",
  }
);

export default StoreSetting;
