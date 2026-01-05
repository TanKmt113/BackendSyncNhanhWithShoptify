import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class User extends Model {
  public id!: number;
  public username!: string;
  public password!: string | null; // Nullable for Google users
  public email!: string;
  public googleId!: string | null; // New field for Google ID

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    username: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: "uniq_users_username",
    },

    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
      unique: "uniq_users_email",
    },

    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    googleId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: "uniq_users_google_id",
    },
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true,
  }
);


export default User;