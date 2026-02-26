import fs from 'fs';
import path from 'path';

const logFilePath = path.join(__dirname, '../../logs/app.log');

// Đảm bảo thư mục logs tồn tại
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function formatTime(date: Date): string {
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function writeLog(level: string, message: string, data?: any) {
  const time = formatTime(new Date());
  let logMessage = `[${time}] [${level}] ${message}`;
  
  if (data) {
    if (typeof data === 'object') {
       logMessage += `\n${JSON.stringify(data, null, 2)}`;
    } else {
       logMessage += ` ${data}`;
    }
  }
  
  logMessage += '\n';

  // Ghi vào file
  fs.appendFile(logFilePath, logMessage, (err) => {
    if (err) {
      console.error('Không thể ghi log vào file:', err);
    }
  });

  if (level === 'ERROR') {
      console.error(logMessage);
  }
}

export const logger = {
  info: (message: string, data?: any) => writeLog('INFO', message, data),
  error: (message: string, data?: any) => writeLog('ERROR', message, data),
  warn: (message: string, data?: any) => writeLog('WARN', message, data),
};
