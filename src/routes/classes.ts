import express from "express";
import { db } from "../db/index.js";
import { classes, departments, subjects, user } from "../db/schemas/index.js";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";

const classesRouter = express.Router();

// -----------------------------------------------------------------------------
// GET / - Get all classes (Public/Authenticated users)
// -----------------------------------------------------------------------------
classesRouter.get("/", async (req, res) => {
  try {
    const { search, subject, teacher, page = 1, limit = 10 } = req.query;
    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.min(
      Math.max(1, parseInt(String(limit), 10) || 10),
      100,
    );
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (search) {
      filterConditions.push(
        or(
          ilike(classes.name, `%${search}%`),
          ilike(classes.inviteCode, `%${search}%`),
        ),
      );
    }
    if (subject) {
      filterConditions.push(ilike(subjects.name, `%${subject}%`));
    }
    if (teacher) {
      filterConditions.push(ilike(user.name, `%${teacher}%`));
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(whereClause);

    const totalCount = Number(countResult[0]?.count || 0);

    const classesList = await db
      .select({
        ...getTableColumns(classes),
        subject: { ...getTableColumns(subjects) },
        teacher: { ...getTableColumns(user) },
      })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(whereClause)
      .orderBy(desc(classes.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    return res.status(200).json({
      data: classesList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// -----------------------------------------------------------------------------
// GET /:id - Get single class by ID (Public/Authenticated users)
// -----------------------------------------------------------------------------
classesRouter.get("/:id", async (req, res) => {
  try {
    const classId = Number(req.params.id);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class ID" });
    }

    const [classDetails] = await db
      .select({
        ...getTableColumns(classes),
        subject: { ...getTableColumns(subjects) },
        department: { ...getTableColumns(departments) },
        teacher: { ...getTableColumns(user) },
      })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(eq(classes.id, classId));

    if (!classDetails) {
      return res.status(404).json({ error: "No class found" });
    }

    return res.status(200).json({ data: classDetails });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// -----------------------------------------------------------------------------
// POST / - Create class (Admin Only)
// -----------------------------------------------------------------------------
classesRouter.post("/", async (req, res) => {
  try {
    const [createClass] = await db
      .insert(classes)
      .values({
        ...req.body,
        inviteCode: Math.random().toString(36).substring(2, 9),
        schedules: req.body.schedules || [],
      })
      .returning({ id: classes.id });

    if (!createClass) {
      throw new Error("Failed to create class");
    }

    return res.status(201).json({ id: createClass.id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// -----------------------------------------------------------------------------
// PUT /:id - Update class (Admin Only)
// -----------------------------------------------------------------------------
classesRouter.patch("/:id", async (req, res) => {
  try {
    const classId = Number(req.params.id);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class ID" });
    }

    const [updatedClass] = await db
      .update(classes)
      .set({
        ...req.body,
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId))
      .returning();

    if (!updatedClass) {
      return res.status(404).json({ error: "Class not found" });
    }

    return res.status(200).json({ data: updatedClass });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// -----------------------------------------------------------------------------
// DELETE /:id - Delete class (Admin Only)
// -----------------------------------------------------------------------------
classesRouter.delete("/:id", async (req, res) => {
  try {
    const classId = Number(req.params.id);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class ID" });
    }

    const [deletedClass] = await db
      .delete(classes)
      .where(eq(classes.id, classId))
      .returning({ id: classes.id });

    if (!deletedClass) {
      return res.status(404).json({ error: "Class not found" });
    }

    return res
      .status(200)
      .json({ message: "Class deleted successfully", id: deletedClass.id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default classesRouter;
