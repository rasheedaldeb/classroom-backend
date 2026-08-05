import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import express from "express";
import { departments, subjects } from "../db/schemas/index.js";
import { db } from "../db/index.js";
const router = express.Router();
// get all subjects with optional search , filter , pagination
router.get("/", async (req, res) => {
  try {
    const { search, filter, department, page = 1, limit = 10 } = req.query;
    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.min(
      Math.max(1, parseInt(String(limit), 10) || 10),
      100,
    );
    const offset = (currentPage - 1) * limitPerPage;
    const filterConditions = [];
    // if search is exists , filter by subject name or code
    if (search) {
      filterConditions.push(
        or(
          ilike(subjects.name, `%${search}%`),
          ilike(subjects.code, `%${search}%`),
        ),
      );
    }
    // if department filter is exists , filter by department
    if (department) {
      filterConditions.push(ilike(departments.name, `%${department}%`));
      const depPattern = `%${String(department).replace(/[%_]/g, `\\$&`)}%`;
      filterConditions.push(ilike(departments.name, depPattern));
    }
    // combine all filters using AND if any exist
    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause);
    const totalCount = countResult[0]?.count || 0;
    const subjectsList = await db
      .select({
        ...getTableColumns(subjects),
        department: { ...getTableColumns(departments) },
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
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
export default router;
