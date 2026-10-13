import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/db";
import type { JwtPayload } from "@/utils/jwt";
import { httpError, isUniqueViolation } from "@/utils/errors";
import { collectSubmissionFiles } from "@/utils/storage";
import type {
  CreateCourseInput,
  ListCoursesQuery,
  UpdateCourseInput,
} from "./courses.schema";

const courseInclude = {
  teacher: { select: { id: true, name: true } },
  _count: {
    select: { enrollments: { where: { status: "active" } }, lessons: true },
  },
} satisfies Prisma.CourseInclude;

type CourseWithRelations = Prisma.CourseGetPayload<{
  include: typeof courseInclude;
}>;

export async function listCourses(
  { q, status, category, teacherId, page, pageSize }: ListCoursesQuery,
  actor: JwtPayload,
) {
  const where: Prisma.CourseWhereInput = {};
  // Students only ever see published courses
  if (actor.role === "student") where.status = "published";
  else if (status) where.status = status;
  if (category) where.category = category;
  if (teacherId) where.teacherId = teacherId;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.course.findMany({
      where,
      include: courseInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.course.count({ where }),
  ]);

  return { data: rows.map(toCourseDto), meta: { page, pageSize, total } };
}

export async function getCourse(id: string, actor: JwtPayload) {
  const course = await prisma.course.findUnique({
    where: { id },
    include: courseInclude,
  });
  if (!course || (actor.role === "student" && course.status !== "published")) {
    throw httpError(404, "Course not found");
  }
  return toCourseDto(course);
}

export async function createCourse(
  input: CreateCourseInput,
  actor: JwtPayload,
) {
  if (actor.role !== "admin")
    throw httpError(403, "Only admins can create courses");
  await assertTeacher(input.teacherId);

  try {
    const course = await prisma.course.create({
      data: {
        title: input.title,
        code: input.code,
        category: input.category,
        description: input.description || null,
        teacherId: input.teacherId,
      },
      include: courseInclude,
    });
    return toCourseDto(course);
  } catch (e) {
    if (isUniqueViolation(e))
      throw httpError(409, `Course code "${input.code}" already exists`);
    throw e;
  }
}

export async function updateCourse(
  id: string,
  input: UpdateCourseInput,
  actor: JwtPayload,
) {
  const existing = await prisma.course.findUnique({
    where: { id },
    select: { teacherId: true },
  });
  if (!existing) throw httpError(404, "Course not found");

  if (actor.role === "teacher") {
    if (existing.teacherId !== actor.sub) {
      throw httpError(403, "You can only edit courses assigned to you");
    }
    if (input.teacherId && input.teacherId !== actor.sub) {
      throw httpError(403, "Teachers can't reassign courses");
    }
  }
  if (input.teacherId) await assertTeacher(input.teacherId);

  const { description, ...rest } = input;
  try {
    const course = await prisma.course.update({
      where: { id },
      data: {
        ...rest,
        ...(description !== undefined && { description: description || null }),
      },
      include: courseInclude,
    });
    return toCourseDto(course);
  } catch (e) {
    if (isUniqueViolation(e))
      throw httpError(409, `Course code "${input.code}" already exists`);
    throw e;
  }
}

export async function deleteCourse(id: string, actor: JwtPayload) {
  // Route gate already limits this to admins; keep the rule enforced here too
  if (actor.role !== "admin")
    throw httpError(403, "Only admins can delete courses");
  const existing = await prisma.course.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw httpError(404, "Course not found");
  const removeFiles = await collectSubmissionFiles({
    submission: { assignment: { courseId: id } },
  });
  await prisma.course.delete({ where: { id } });
  await removeFiles();
}

async function assertTeacher(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user || user.role !== "teacher") {
    throw httpError(400, "Assigned user must have the teacher role");
  }
}

export function toCourseDto(course: CourseWithRelations) {
  return {
    id: course.id,
    title: course.title,
    code: course.code,
    category: course.category,
    description: course.description,
    status: course.status,
    teacher: course.teacher,
    students: course._count.enrollments,
    lessons: course._count.lessons,
    createdAt: course.createdAt,
  };
}
