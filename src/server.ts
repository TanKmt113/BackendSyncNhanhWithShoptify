import "dotenv/config";
import http from "http";
import app from "./app";
import sequelize from "./config/database";
import { initSocket } from "./utils/socket";

const PORT = process.env.PORT || 4000;

// Create HTTP server from Express app
const server = http.createServer(app);

// Init Socket.io
initSocket(server);

sequelize.sync({ alter: true }).then(() => {
    console.log("✅ Database synced");
    server.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}).catch((err) => {
    console.error("❌ Database sync failed:", err);
});
