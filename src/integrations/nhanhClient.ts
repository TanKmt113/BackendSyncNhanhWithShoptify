import axios from "axios";
import { StoreSettingAttributes } from "../types/config";

const createNhanhClient = (configDB: StoreSettingAttributes) => {
  const client = axios.create({
    baseURL: configDB.nhanh_api_url || '',
  });

  client.interceptors.request.use((config) => {
    config.headers.Authorization = configDB.nhanh_app_token || '';
    config.headers["Content-Type"] = "application/json"
    return config;
  });

  return client;
};

export default createNhanhClient;