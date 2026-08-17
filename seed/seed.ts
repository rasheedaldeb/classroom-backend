import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "better-auth/crypto";
import { inArray } from "drizzle-orm";

import { db } from "../src/db";
import {
  account,
  classes,
  departments,
  enrollments,
  session,
  subjects,
  user,
} from "../src/db/schemas";

type SeedUser = {
  id: string;
  name: string;
  email: string;
  role: "student" | "teacher" | "admin";
  password: string;
  image: string;
};

type SeedDepartment = {
  code: string;
  name: string;
  description: string;
};

type SeedSubject = {
  code: string;
  name: string;
  description: string;
  departmentCode: string;
};

type SeedClass = {
  name: string;
  description: string;
  capacity: number;
  status: "active" | "inactive" | "archived";
  inviteCode: string;
  subjectCode: string;
  teacherId: string;
  bannerUrl: string;
};

type SeedEnrollment = {
  classInviteCode: string;
  studentId: string;
};

type SeedData = {
  users: SeedUser[];
  departments: SeedDepartment[];
  subjects: SeedSubject[];
  classes: SeedClass[];
  enrollments: SeedEnrollment[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadSeedData = async (): Promise<SeedData> => {
  const dataPath = path.join(__dirname, "data.json");
  const raw = await readFile(dataPath, "utf-8");
  return JSON.parse(raw) as SeedData;
};

const ensureMapValue = <T>(map: Map<string, T>, key: string, label: string) => {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing ${label} for key: ${key}`);
  }
  return value;
};

const seed = async () => {
  const data = await loadSeedData();

  // 1. Wipe existing tables to ensure clean state
  await db.delete(enrollments);
  await db.delete(classes);
  await db.delete(subjects);
  await db.delete(departments);
  await db.delete(session);
  await db.delete(account);
  await db.delete(user);

  // 2. Insert Users and Accounts
  if (data.users.length) {
    // Insert into 'user' table
    await db
      .insert(user)
      .values(
        data.users.map((seedUser) => ({
          id: seedUser.id,
          name: seedUser.name,
          email: seedUser.email,
          emailVerified: true,
          image: seedUser.image,
          role: seedUser.role,
        })),
      )
      .onConflictDoNothing({ target: user.id });

    // Hash passwords for all users asynchronously
    const accountsToInsert = await Promise.all(
      data.users.map(async (seedUser) => {
        const hashedPassword = await hashPassword(seedUser.password);
        return {
          id: `acc_${seedUser.id}`,
          userId: seedUser.id,
          accountId: seedUser.email,
          providerId: "credential", // Fixed: Changed from "credentials" to "credential"
          password: hashedPassword,
        };
      }),
    );

    // Insert into 'account' table with hashed passwords
    await db
      .insert(account)
      .values(accountsToInsert)
      .onConflictDoNothing({ target: [account.providerId, account.accountId] });
  }

  // 3. Insert Departments
  if (data.departments.length) {
    await db
      .insert(departments)
      .values(
        data.departments.map((dept) => ({
          code: dept.code,
          name: dept.name,
          description: dept.description,
        })),
      )
      .onConflictDoNothing({ target: departments.code });
  }

  const departmentCodes = data.departments.map((dept) => dept.code);
  const departmentRows =
    departmentCodes.length === 0
      ? []
      : await db
          .select({ id: departments.id, code: departments.code })
          .from(departments)
          .where(inArray(departments.code, departmentCodes));
  const departmentMap = new Map(
    departmentRows.map((row) => [row.code, row.id]),
  );

  // 4. Insert Subjects
  if (data.subjects.length) {
    const subjectsToInsert = data.subjects.map((subject) => ({
      code: subject.code,
      name: subject.name,
      description: subject.description,
      departmentId: ensureMapValue(
        departmentMap,
        subject.departmentCode,
        "department",
      ),
    }));

    await db
      .insert(subjects)
      .values(subjectsToInsert)
      .onConflictDoNothing({ target: subjects.code });
  }

  const subjectCodes = data.subjects.map((subject) => subject.code);
  const subjectRows =
    subjectCodes.length === 0
      ? []
      : await db
          .select({ id: subjects.id, code: subjects.code })
          .from(subjects)
          .where(inArray(subjects.code, subjectCodes));
  const subjectMap = new Map(subjectRows.map((row) => [row.code, row.id]));

  // 5. Insert Classes
  if (data.classes.length) {
    const classesToInsert = data.classes.map((classItem) => ({
      name: classItem.name,
      description: classItem.description,
      capacity: classItem.capacity,
      status: classItem.status,
      inviteCode: classItem.inviteCode,
      subjectId: ensureMapValue(subjectMap, classItem.subjectCode, "subject"),
      teacherId: classItem.teacherId,
      bannerUrl: classItem.bannerUrl,
      bannerCldPubId: null,
      schedules: [],
    }));

    await db
      .insert(classes)
      .values(classesToInsert)
      .onConflictDoNothing({ target: classes.inviteCode });
  }

  const classInviteCodes = data.classes.map(
    (classItem) => classItem.inviteCode,
  );
  const classRows =
    classInviteCodes.length === 0
      ? []
      : await db
          .select({ id: classes.id, inviteCode: classes.inviteCode })
          .from(classes)
          .where(inArray(classes.inviteCode, classInviteCodes));
  const classMap = new Map(classRows.map((row) => [row.inviteCode, row.id]));

  // 6. Insert Enrollments
  if (data.enrollments.length) {
    const enrollmentsToInsert = data.enrollments.map((enrollment) => ({
      classId: ensureMapValue(classMap, enrollment.classInviteCode, "class"),
      studentId: enrollment.studentId,
    }));

    await db
      .insert(enrollments)
      .values(enrollmentsToInsert)
      .onConflictDoNothing();
  }
};

seed()
  .then(() => {
    console.log("Seed completed successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
