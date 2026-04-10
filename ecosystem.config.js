module.exports = {
    apps: [
        {
            name: "nhanh-api",
            script: "dist/server.js",
            instances: 1,
            exec_mode: "fork",
            max_memory_restart: "300M"
        }
    ]
};