import express from "express";
import session from "express-session";
import morgan from "morgan";
import bodyParser from "body-parser";
import cors from "cors";
import passport from "./config/passport"; // Import passport config
import routes from "./routes";
import { errorHandler } from "./middlewares/error.middleware";

const app = express();

const allowedOrigins = [
  process.env.DASHBOARD_URL,
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Optionally allow all for dev, or fail
      // callback(new Error('Not allowed by CORS'));
      // For development convenience with your specific issue:
      callback(null, true);
    }
  },
  credentials: true
}));

app.use(morgan("dev"));
app.use(bodyParser.json({
  limit: "2mb",
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize Passport
app.use(passport.initialize());

// Middleware xử lý lỗi JSON (ví dụ: body gửi lên không đúng định dạng)
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && "body" in err) {
    console.error("⚠️ Bad JSON received:", err.message);
    if ((req as any).rawBody) {
      console.error("⚠️ Raw Body Content:", (req as any).rawBody.toString());
    }
    return res.status(400).json({ success: false, message: "Invalid JSON format" });
  }
  next();
});

// Gắn routes
app.use("/api", routes);

app.use(errorHandler);

export default app;
