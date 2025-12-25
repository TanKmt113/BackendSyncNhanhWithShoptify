import axios from "axios";

const createNhanhClient = () => {
  const client = axios.create({
    baseURL: process.env.NHANH_API_URL as string,
  });

  client.interceptors.request.use((config) => {
    config.headers.Authorization = process.env.NHANH_APP_TOKEN as string;
    config.headers["Content-Type"] = "application/json"
    return config;
  });

  return client;
};

export default createNhanhClient;