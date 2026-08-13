import AgentAPI from "apminsight";
AgentAPI.config();
import express from "express";
import subjectsRouter from "./routes/subjects.js";
import cors from "cors";
import securityMiddleware from "./middleware/security.js";
import { auth } from "./lib/auth.js";
import { toNodeHandler } from "better-auth/node";
import usersRouter from "./routes/users.js";
import classesRouter from "./routes/classes.js";
import departmentsRouter from "./routes/department.js";
import enrollmentsRouter from "./routes/enrollments.js";
import statsRouter from "./routes/stats.js";
const app = express();
const port = 8000;
if (!process.env.FRONTEND_URL) {
  throw new Error("frontend url is not set in .env file");
}
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://classroom-frontend-six-iota.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like Postman or curl)
      if (!origin) return callback(null, true);

      // Check if origin matches allowed list or any Vercel preview domain
      const isAllowed =
        allowedOrigins.includes(origin) || origin.endsWith(".vercel.app");

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error("Blocked by CORS policy"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());
app.use(securityMiddleware);
app.use("/api/subjects", subjectsRouter);
app.use("/api/users", usersRouter);
app.use("/api/classes", classesRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/enrollments", enrollmentsRouter);
app.use("/api/stats", statsRouter);
app.get("/", (req, res) => {
  res.send("Hello World");
});
app.listen(port, () => console.log(`app running in port ${port}`));
