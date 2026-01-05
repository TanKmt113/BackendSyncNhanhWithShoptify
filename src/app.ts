import express from "express";
import morgan from "morgan";
import bodyParser from "body-parser";
import cors from "cors";
import passport from "./config/passport"; // Import passport config
import routes from "./routes";
import { errorHandler } from "./middlewares/error.middleware";
import cookieParser from "cookie-parser";

const app = express();

const allowedOrigins = [
  process.env.DASHBOARD_URL,
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(cookieParser());
app.use(morgan("dev"));
app.use(bodyParser.json({
  limit: "2mb",
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(passport.initialize());
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
app.use("/api", routes);
app.use(errorHandler);

export default app;
