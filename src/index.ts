import AgentAPI from "apminsight";
AgentAPI.config();
import express from "express";
import subjectsRouter from "./routes/subjects";
import cors from "cors";
import securityMiddleware from "./middleware/security";
import { auth } from "./lib/auth";
import { toNodeHandler } from "better-auth/node";
const app = express();
const port = 8000;
if (!process.env.FRONTEND_URL) {
  throw new Error("frontend url is not set in .env file");
}
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json());
app.use(securityMiddleware);
app.use("/api/subjects", subjectsRouter);
app.get("/", (req, res) => {
  res.send("Hello World");
});
app.listen(port, () => console.log(`app running in port ${port}`));
