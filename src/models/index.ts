import Product from "./Product";
import Inventory from "./Inventory";
import Order from "./Order";
import SyncLog from "./SyncLog";
import Notification from "./Notification";
import StoreSetting from "./StoreSetting";
import User from "./User";
import Logo from "./Logo";

// Associations
Product.hasOne(Inventory, { foreignKey: "product_id", as: "inventory" });
Inventory.belongsTo(Product, { foreignKey: "product_id", as: "product" });

export { Product, Inventory, Order, SyncLog, Notification, StoreSetting, User, Logo };
