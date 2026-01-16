import axios from "axios";
import { StoreSettingAttributes } from "../types/config";

const createShoptify = (configDB: StoreSettingAttributes) => {

  const shopName = configDB.shop_name;
  const apiVersion = configDB.shopify_api_version;
  const adminAPI = configDB.shopify_admin_api;

  const client = axios.create({
    baseURL: `https://${shopName}.myshopify.com/admin/api/${apiVersion}`,
    headers: {
      "X-Shopify-Access-Token": adminAPI,
      "Content-Type": "application/json",
    },
  });

  return client;
};

export default createShoptify;