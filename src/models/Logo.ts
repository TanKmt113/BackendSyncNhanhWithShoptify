import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

interface LogoAttributes {
  id?: number;
  logo_url: string;
  logo_name?: string;
  file_type?: string;
  file_size?: number;
  created_at?: Date;
  updated_at?: Date;
}

class Logo extends Model<LogoAttributes> implements LogoAttributes {
  public id!: number;
  public logo_url!: string;
  public logo_name?: string;
  public file_type?: string;
  public file_size?: number;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Logo.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    logo_url: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "URL or base64 data of the logo",
    },
    logo_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Original filename of the logo",
    },
    file_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "MIME type of the logo (e.g., image/png)",
    },
    file_size: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "File size in bytes",
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "logos",
    timestamps: true,
    underscored: true,
  }
);

export default Logo;
