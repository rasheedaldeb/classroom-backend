import express, { Request, Response, NextFunction } from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  classes,
  departments,
  enrollments,
  subjects,
  user,
} from "../db/schemas/index.js";

const subjectsRouter = express.Router();

// -----------------------------------------------------------------------------
// GET / - List all subjects with optional search, department filter, and pagination
// -----------------------------------------------------------------------------
subjectsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { search, department, page = "1", limit = "10" } = req.query;

    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.max(1, parseInt(String(limit), 10) || 10);
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (typeof search === "string" && search.trim()) {
      filterConditions.push(
        or(
          ilike(subjects.name, `%${search}%`),
          ilike(subjects.code, `%${search}%`),
        ),
      );
    }

    if (typeof department === "string" && department.trim()) {
      filterConditions.push(ilike(departments.name, `%${department}%`));
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    // Count query including the join for department filtering
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause);

    const totalCount = Number(countResult[0]?.count ?? 0);

    // Main query
    const subjectsList = await db
      .select({
        ...getTableColumns(subjects),
        department: {
          ...getTableColumns(departments),
        },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause)
      .orderBy(desc(subjects.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    return res.status(200).json({
      data: subjectsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    console.error("GET /subjects error:", error);
    return res.status(500).json({ error: "Failed to fetch subjects" });
  }
});

// -----------------------------------------------------------------------------
// POST / - Create a new subject (Admin Only)
// -----------------------------------------------------------------------------
subjectsRouter.post("/", async (req, res) => {
  try {
    const { departmentId, name, code, description } = req.body;

    const [createdSubject] = await db
      .insert(subjects)
      .values({ departmentId, name, code, description })
      .returning({ id: subjects.id });

    if (!createdSubject) {
      throw new Error("Failed to create subject");
    }

    return res.status(201).json({ data: createdSubject });
  } catch (error) {
    console.error("POST /subjects error:", error);
    return res.status(500).json({ error: "Failed to create subject" });
  }
});

// -----------------------------------------------------------------------------
// PUT /:id - Update an existing subject (Admin Only)
// -----------------------------------------------------------------------------
subjectsRouter.patch("/:id", async (req, res) => {
  try {
    const subjectId = Number(req.params.id);

    if (!Number.isFinite(subjectId)) {
      return res.status(400).json({ error: "Invalid subject id" });
    }

    const { departmentId, name, code, description } = req.body;

    const [updatedSubject] = await db
      .update(subjects)
      .set({
        ...(departmentId !== undefined && { departmentId }),
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(description !== undefined && { description }),
        updatedAt: new Date(),
      })
      .where(eq(subjects.id, subjectId))
      .returning();

    if (!updatedSubject) {
      return res.status(404).json({ error: "Subject not found" });
    }

    return res.status(200).json({ data: updatedSubject });
  } catch (error) {
    console.error("PUT /subjects/:id error:", error);
    return res.status(500).json({ error: "Failed to update subject" });
  }
});

// -----------------------------------------------------------------------------
// DELETE /:id - Delete a subject (Admin Only)
// -----------------------------------------------------------------------------
subjectsRouter.delete("/:id", async (req, res) => {
  try {
    const subjectId = Number(req.params.id);

    if (!Number.isFinite(subjectId)) {
      return res.status(400).json({ error: "Invalid subject id" });
    }

    const [deletedSubject] = await db
      .delete(subjects)
      .where(eq(subjects.id, subjectId))
      .returning({ id: subjects.id });

    if (!deletedSubject) {
      return res.status(404).json({ error: "Subject not found" });
    }

    return res.status(200).json({
      message: "Subject deleted successfully",
      id: deletedSubject.id,
    });
  } catch (error) {
    console.error("DELETE /subjects/:id error:", error);
    return res.status(500).json({ error: "Failed to delete subject" });
  }
});

// -----------------------------------------------------------------------------
// GET /:id - Get subject details with counts
// -----------------------------------------------------------------------------
subjectsRouter.get("/:id", async (req, res) => {
  try {
    const subjectId = parseInt(req.params.id, 10);

    if (!Number.isFinite(subjectId)) {
      return res.status(400).json({ error: "Invalid subject id" });
    }

    const [subject] = await db
      .select({
        ...getTableColumns(subjects),
        department: {
          ...getTableColumns(departments),
        },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(eq(subjects.id, subjectId));

    if (!subject) {
      return res.status(404).json({ error: "Subject not found" });
    }

    const classesCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .where(eq(classes.subjectId, subjectId));

    return res.status(200).json({
      data: {
        subject,
        totals: {
          classes: Number(classesCount[0]?.count ?? 0),
        },
      },
    });
  } catch (error) {
    console.error("GET /subjects/:id error:", error);
    return res.status(500).json({ error: "Failed to fetch subject details" });
  }
});

// -----------------------------------------------------------------------------
// GET /:id/classes - List classes in a subject with pagination
// -----------------------------------------------------------------------------
subjectsRouter.get("/:id/classes", async (req, res) => {
  try {
    const subjectId = parseInt(req.params.id, 10);
    const { page = "1", limit = "10" } = req.query;

    if (!Number.isFinite(subjectId)) {
      return res.status(400).json({ error: "Invalid subject id" });
    }

    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.max(1, parseInt(String(limit), 10) || 10);
    const offset = (currentPage - 1) * limitPerPage;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .where(eq(classes.subjectId, subjectId));

    const totalCount = Number(countResult[0]?.count ?? 0);

    const classesList = await db
      .select({
        ...getTableColumns(classes),
        teacher: {
          ...getTableColumns(user),
        },
      })
      .from(classes)
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(eq(classes.subjectId, subjectId))
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
    console.error("GET /subjects/:id/classes error:", error);
    return res.status(500).json({ error: "Failed to fetch subject classes" });
  }
});

// -----------------------------------------------------------------------------
// GET /:id/users - List users in a subject by role with pagination
// -----------------------------------------------------------------------------
subjectsRouter.get("/:id/users", async (req, res) => {
  try {
    const subjectId = parseInt(req.params.id, 10);
    const { role, page = "1", limit = "10" } = req.query;

    if (!Number.isFinite(subjectId)) {
      return res.status(400).json({ error: "Invalid subject id" });
    }

    if (role !== "teacher" && role !== "student") {
      return res.status(400).json({ error: "Invalid role" });
    }

    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.max(1, parseInt(String(limit), 10) || 10);
    const offset = (currentPage - 1) * limitPerPage;

    const baseSelect = {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      role: user.role,
      imageCldPubId: user.imageCldPubId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    const groupByFields = [
      user.id,
      user.name,
      user.email,
      user.emailVerified,
      user.image,
      user.role,
      user.imageCldPubId,
      user.createdAt,
      user.updatedAt,
    ];

    const countResult =
      role === "teacher"
        ? await db
            .select({ count: sql<number>`count(distinct ${user.id})` })
            .from(user)
            .leftJoin(classes, eq(user.id, classes.teacherId))
            .where(and(eq(user.role, role), eq(classes.subjectId, subjectId)))
        : await db
            .select({ count: sql<number>`count(distinct ${user.id})` })
            .from(user)
            .leftJoin(enrollments, eq(user.id, enrollments.studentId))
            .leftJoin(classes, eq(enrollments.classId, classes.id))
            .where(and(eq(user.role, role), eq(classes.subjectId, subjectId)));

    const totalCount = Number(countResult[0]?.count ?? 0);

    const usersList =
      role === "teacher"
        ? await db
            .select(baseSelect)
            .from(user)
            .leftJoin(classes, eq(user.id, classes.teacherId))
            .where(and(eq(user.role, role), eq(classes.subjectId, subjectId)))
            .groupBy(...groupByFields)
            .orderBy(desc(user.createdAt))
            .limit(limitPerPage)
            .offset(offset)
        : await db
            .select(baseSelect)
            .from(user)
            .leftJoin(enrollments, eq(user.id, enrollments.studentId))
            .leftJoin(classes, eq(enrollments.classId, classes.id))
            .where(and(eq(user.role, role), eq(classes.subjectId, subjectId)))
            .groupBy(...groupByFields)
            .orderBy(desc(user.createdAt))
            .limit(limitPerPage)
            .offset(offset);

    return res.status(200).json({
      data: usersList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    console.error("GET /subjects/:id/users error:", error);
    return res.status(500).json({ error: "Failed to fetch subject users" });
  }
});

export default subjectsRouter;
