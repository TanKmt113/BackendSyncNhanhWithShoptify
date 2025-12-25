import axios from "axios";

const shopName = process.env.SHOPIFY_SHOP_NAME; 
const apiVersion = process.env.SHOPIFY_API_VERSION || "2025-10";
const adminAPI = process.env.SHOPIFY_ADMIN_API ;


const shopifyClient = axios.create({
  baseURL: `https://${shopName}.myshopify.com/admin/api/${apiVersion}`,
  headers: {
    "X-Shopify-Access-Token": adminAPI, 
    "Content-Type": "application/json",
  },
});

export default shopifyClient;
