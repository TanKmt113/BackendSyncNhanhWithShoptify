import { Request, Response } from "express";
import fs from "fs";
import path from "path";

export class LogController {
  static async viewLogs(req: Request, res: Response) {
    console.log("Processing GET /logs request...");
    try {
      const logFilePath = path.join(process.cwd(), "logs", "app.log");
      console.log("Reading log file from:", logFilePath);

      let logContent = "";

      if (fs.existsSync(logFilePath)) {
        logContent = fs.readFileSync(logFilePath, "utf-8");
        console.log("Log file read successfully. Size:", logContent.length);
      } else {
        console.log("Log file not found.");
        logContent = "Log file not found or empty.";
      }

      // Escape HTML characters to prevent XSS
      const safeLogContent = logContent
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

      // Replace backslashes with forward slashes safely
      const safePath = logFilePath.split(path.sep).join("/");

      const html = `
        <!DOCTYPE html>
        <html lang="en" class="dark">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>System Logs Viewer</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <script>
            tailwind.config = {
              darkMode: 'class',
              theme: {
                extend: {
                  colors: {
                    gray: {
                      900: '#121212',
                      800: '#1e1e1e',
                      700: '#2d2d2d',
                    }
                  }
                }
              }
            }
          </script>
          <style>
            ::-webkit-scrollbar { width: 10px; }
            ::-webkit-scrollbar-track { background: #1e1e1e; }
            ::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 5px; }
            ::-webkit-scrollbar-thumb:hover { background: #6b7280; }
          </style>
        </head>
        <body class="bg-gray-900 text-gray-300 font-mono h-screen flex flex-col overflow-hidden">
          
          <!-- Header -->
          <header class="flex items-center justify-between px-6 py-4 bg-gray-800 border-b border-gray-700 shadow-lg shrink-0">
            <div class="flex items-center space-x-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h1 class="text-xl font-bold text-white tracking-wide">System Logs</h1>
              <span class="px-2 py-0.5 rounded text-xs font-semibold bg-gray-700 text-gray-400 border border-gray-600">app.log</span>
            </div>
            
            <div class="flex space-x-3">
              <button onclick="scrollToBottom()" class="flex items-center space-x-2 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 transition text-sm text-white">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <span>Bottom</span>
              </button>
              <button onclick="window.location.reload()" class="flex items-center space-x-2 px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 transition text-sm text-white font-medium shadow-md hover:shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </button>
            </div>
          </header>

          <!-- Log Content -->
          <main class="flex-1 overflow-hidden relative">
            <div id="logContainer" class="absolute inset-0 p-6 overflow-auto scroll-smooth">
              <pre class="text-sm leading-relaxed whitespace-pre-wrap break-all"><code id="logContent" class="language-log">${safeLogContent}</code></pre>
            </div>
          </main>

          <!-- Footer/Status Bar -->
          <footer class="bg-gray-800 border-t border-gray-700 px-6 py-2 text-xs text-gray-500 flex justify-between shrink-0">
            <span>Path: ${safePath}</span>
            <span id="timestamp">Last updated: ${new Date().toLocaleString()}</span>
          </footer>

          <script>
            const logContainer = document.getElementById('logContainer');

            function scrollToBottom() {
              logContainer.scrollTop = logContainer.scrollHeight;
            }

            window.onload = scrollToBottom;
          </script>
        </body>
        </html>
      `;

      res.send(html);
    } catch (error) {
      console.error("Error reading log file:", error);
      res.status(500).send("Internal Server Error");
    }
  }
}