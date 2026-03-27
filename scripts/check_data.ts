import sequelize from "../src/config/database";

async function checkData() {
  try {
    await sequelize.authenticate();
    const [results] = await sequelize.query("SELECT id, nhanh_stock, shopify_stock, inventory_status, syncStatus FROM products LIMIT 5");
    console.log(JSON.stringify(results, null, 2));
    
    const [count] = await sequelize.query("SELECT COUNT(*) as total FROM products WHERE nhanh_stock > 0 OR shopify_stock > 0");
    console.log("Products with stock info:", count);
    
    process.exit(0);
  } catch (error) {
    console.error("Error checking data:", error);
    process.exit(1);
  }
}

checkData();
