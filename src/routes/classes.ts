import express from "express";
import { db } from "../db/index.js";
import { classes } from "../db/schemas/index.js";
const classesRouter = express.Router();
classesRouter.post("/", async (req, res) => {
  try {
    const [createClass] = await db
      .insert(classes)
      .values({
        ...req.body,
        inviteCode: Math.random().toString(36).substring(2, 9),
        schedules: [],
      })
      .returning({ id: classes.id });
    if (!createClass) {
      throw new Error("Failed to create class");
    } else {
      return res.status(201).json({ id: createClass });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});
export default classesRouter;
