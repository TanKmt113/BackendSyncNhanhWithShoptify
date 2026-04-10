"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("../src/config/database"));
async function checkData() {
    try {
        await database_1.default.authenticate();
        const [results] = await database_1.default.query("SELECT id, nhanh_stock, shopify_stock, inventory_status, syncStatus FROM products LIMIT 5");
        console.log(JSON.stringify(results, null, 2));
        const [count] = await database_1.default.query("SELECT COUNT(*) as total FROM products WHERE nhanh_stock > 0 OR shopify_stock > 0");
        console.log("Products with stock info:", count);
        process.exit(0);
    }
    catch (error) {
        console.error("Error checking data:", error);
        process.exit(1);
    }
}
checkData();
//# sourceMappingURL=check_data.js.map