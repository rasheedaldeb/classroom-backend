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

const departmentsRouter = express.Router();

// -----------------------------------------------------------------------------
// GET / - List all departments with optional search and pagination
// -----------------------------------------------------------------------------
departmentsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { search, page = "1", limit = "10" } = req.query;

    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.max(1, parseInt(String(limit), 10) || 10);
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (typeof search === "string" && search.trim()) {
      filterConditions.push(
        or(
          ilike(departments.name, `%${search}%`),
          ilike(departments.code, `%${search}%`),
        ),
      );
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(departments)
      .where(whereClause);

    const totalCount = Number(countResult[0]?.count ?? 0);

    const departmentsList = await db
      .select({
        ...getTableColumns(departments),
        totalSubjects: sql<number>`count(${subjects.id})`,
      })
      .from(departments)
      .leftJoin(subjects, eq(departments.id, subjects.departmentId))
      .where(whereClause)
      .groupBy(departments.id)
      .orderBy(desc(departments.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    return res.status(200).json({
      data: departmentsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    console.error("GET /departments error:", error);
    return res.status(500).json({ error: "Failed to fetch departments" });
  }
});

// -----------------------------------------------------------------------------
// POST / - Create a new department (Admin Only)
// -----------------------------------------------------------------------------
departmentsRouter.post("/", async (req, res) => {
  try {
    const { code, name, description } = req.body;

    const [createdDepartment] = await db
      .insert(departments)
      .values({ code, name, description })
      .returning({ id: departments.id });

    if (!createdDepartment) {
      throw new Error("Failed to create department");
    }

    return res.status(201).json({ data: createdDepartment });
  } catch (error) {
    console.error("POST /departments error:", error);
    return res.status(500).json({ error: "Failed to create department" });
  }
});

// -----------------------------------------------------------------------------
// PUT /:id - Update an existing department (Admin Only)
// -----------------------------------------------------------------------------
departmentsRouter.patch("/:id", async (req, res) => {
  try {
    const departmentId = Number(req.params.id);

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department id" });
    }

    const { code, name, description } = req.body;

    const [updatedDepartment] = await db
      .update(departments)
      .set({
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        updatedAt: new Date(),
      })
      .where(eq(departments.id, departmentId))
      .returning();

    if (!updatedDepartment) {
      return res.status(404).json({ error: "Department not found" });
    }

    return res.status(200).json({ data: updatedDepartment });
  } catch (error) {
    console.error("PUT /departments/:id error:", error);
    return res.status(500).json({ error: "Failed to update department" });
  }
});

// -----------------------------------------------------------------------------
// DELETE /:id - Delete a department (Admin Only)
// -----------------------------------------------------------------------------
departmentsRouter.delete("/:id", async (req, res) => {
  try {
    const departmentId = Number(req.params.id);

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department id" });
    }

    const [deletedDepartment] = await db
      .delete(departments)
      .where(eq(departments.id, departmentId))
      .returning({ id: departments.id });

    if (!deletedDepartment) {
      return res.status(404).json({ error: "Department not found" });
    }

    return res.status(200).json({
      message: "Department deleted successfully",
      id: deletedDepartment.id,
    });
  } catch (error) {
    console.error("DELETE /departments/:id error:", error);
    return res.status(500).json({ error: "Failed to delete department" });
  }
});

// -----------------------------------------------------------------------------
// GET /:id - Get department details with aggregated counts
// -----------------------------------------------------------------------------
departmentsRouter.get("/:id", async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id, 10);

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department id" });
    }

    const [department] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, departmentId));

    if (!department) {
      return res.status(404).json({ error: "Department not found" });
    }

    const [subjectsCount, classesCount, enrolledStudentsCount] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(*)` })
          .from(subjects)
          .where(eq(subjects.departmentId, departmentId)),
        db
          .select({ count: sql<number>`count(${classes.id})` })
          .from(classes)
          .leftJoin(subjects, eq(classes.subjectId, subjects.id))
          .where(eq(subjects.departmentId, departmentId)),
        db
          .select({ count: sql<number>`count(distinct ${user.id})` })
          .from(user)
          .leftJoin(enrollments, eq(user.id, enrollments.studentId))
          .leftJoin(classes, eq(enrollments.classId, classes.id))
          .leftJoin(subjects, eq(classes.subjectId, subjects.id))
          .where(
            and(
              eq(user.role, "student"),
              eq(subjects.departmentId, departmentId),
            ),
          ),
      ]);

    return res.status(200).json({
      data: {
        department,
        totals: {
          subjects: Number(subjectsCount[0]?.count ?? 0),
          classes: Number(classesCount[0]?.count ?? 0),
          enrolledStudents: Number(enrolledStudentsCount[0]?.count ?? 0),
        },
      },
    });
  } catch (error) {
    console.error("GET /departments/:id error:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch department details" });
  }
});

// -----------------------------------------------------------------------------
// GET /:id/subjects - List subjects in a department
// -----------------------------------------------------------------------------
departmentsRouter.get("/:id/subjects", async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id, 10);
    const { page = "1", limit = "10" } = req.query;

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department id" });
    }

    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.max(1, parseInt(String(limit), 10) || 10);
    const offset = (currentPage - 1) * limitPerPage;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .where(eq(subjects.departmentId, departmentId));

    const totalCount = Number(countResult[0]?.count ?? 0);

    const subjectsList = await db
      .select({
        ...getTableColumns(subjects),
      })
      .from(subjects)
      .where(eq(subjects.departmentId, departmentId))
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
    console.error("GET /departments/:id/subjects error:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch department subjects" });
  }
});

// -----------------------------------------------------------------------------
// GET /:id/classes - List classes in a department
// -----------------------------------------------------------------------------
departmentsRouter.get("/:id/classes", async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id, 10);
    const { page = "1", limit = "10" } = req.query;

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department id" });
    }

    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.max(1, parseInt(String(limit), 10) || 10);
    const offset = (currentPage - 1) * limitPerPage;

    const countResult = await db
      .select({ count: sql<number>`count(${classes.id})` })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .where(eq(subjects.departmentId, departmentId));

    const totalCount = Number(countResult[0]?.count ?? 0);

    const classesList = await db
      .select({
        ...getTableColumns(classes),
        subject: {
          ...getTableColumns(subjects),
        },
        teacher: {
          ...getTableColumns(user),
        },
      })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(eq(subjects.departmentId, departmentId))
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
    console.error("GET /departments/:id/classes error:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch department classes" });
  }
});

// -----------------------------------------------------------------------------
// GET /:id/users - List users in a department by role
// -----------------------------------------------------------------------------
departmentsRouter.get("/:id/users", async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id, 10);
    const { role, page = "1", limit = "10" } = req.query;

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department id" });
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
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .where(
              and(eq(user.role, role), eq(subjects.departmentId, departmentId)),
            )
        : await db
            .select({ count: sql<number>`count(distinct ${user.id})` })
            .from(user)
            .leftJoin(enrollments, eq(user.id, enrollments.studentId))
            .leftJoin(classes, eq(enrollments.classId, classes.id))
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .where(
              and(eq(user.role, role), eq(subjects.departmentId, departmentId)),
            );

    const totalCount = Number(countResult[0]?.count ?? 0);

    const usersList =
      role === "teacher"
        ? await db
            .select(baseSelect)
            .from(user)
            .leftJoin(classes, eq(user.id, classes.teacherId))
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .where(
              and(eq(user.role, role), eq(subjects.departmentId, departmentId)),
            )
            .groupBy(...groupByFields)
            .orderBy(desc(user.createdAt))
            .limit(limitPerPage)
            .offset(offset)
        : await db
            .select(baseSelect)
            .from(user)
            .leftJoin(enrollments, eq(user.id, enrollments.studentId))
            .leftJoin(classes, eq(enrollments.classId, classes.id))
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .where(
              and(eq(user.role, role), eq(subjects.departmentId, departmentId)),
            )
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
    console.error("GET /departments/:id/users error:", error);
    return res.status(500).json({ error: "Failed to fetch department users" });
  }
});

export default departmentsRouter;
