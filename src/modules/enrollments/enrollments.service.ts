import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/db";
import type { JwtPayload } from "@/utils/jwt";
import { httpError, isUniqueViolation } from "@/utils/errors";
import type {
  CreateEnrollmentInput,
  ListEnrollmentsQuery,
  UpdateEnrollmentInput,
} from "./enrollments.schema";

const enrollmentInclude = {
  student: { select: { id: true, name: true, email: true } },
  course: { select: { id: true, title: true, code: true, status: true } },
} satisfies Prisma.EnrollmentInclude;

type EnrollmentWithRelations = Prisma.EnrollmentGetPayload<{
  include: typeof enrollmentInclude;
}>;

function scopeFor(actor: JwtPayload): Prisma.EnrollmentWhereInput {
  if (actor.role === "teacher") return { course: { teacherId: actor.sub } };
  if (actor.role === "student") return { studentId: actor.sub };
  return {};
}

export async function listEnrollments(
  { q, status, courseId, studentId, page, pageSize }: ListEnrollmentsQuery,
  actor: JwtPayload,
) {
  const filters: Prisma.EnrollmentWhereInput = {};
  if (status) filters.status = status;
  if (courseId) filters.courseId = courseId;
  if (studentId) filters.studentId = studentId;
  if (q) {
    filters.OR = [
      { student: { name: { contains: q, mode: "insensitive" } } },
      { student: { email: { contains: q, mode: "insensitive" } } },
      { course: { title: { contains: q, mode: "insensitive" } } },
      { course: { code: { contains: q, mode: "insensitive" } } },
    ];
  }
  const where: Prisma.EnrollmentWhereInput = {
    AND: [scopeFor(actor), filters],
  };

  const [rows, total] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      include: enrollmentInclude,
      orderBy: { enrolledAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.enrollment.count({ where }),
  ]);

  return { data: rows.map(toEnrollmentDto), meta: { page, pageSize, total } };
}

export async function getEnrollment(id: string, actor: JwtPayload) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { AND: [{ id }, scopeFor(actor)] },
    include: enrollmentInclude,
  });
  if (!enrollment) throw httpError(404, "Enrollment not found");
  return toEnrollmentDto(enrollment);
}

export async function createEnrollment(input: CreateEnrollmentInput) {
  await assertEnrollableStudent(input.studentId);
  await assertEnrollableCourse(input.courseId);

  try {
    const enrollment = await prisma.enrollment.create({
      data: input,
      include: enrollmentInclude,
    });
    return toEnrollmentDto(enrollment);
  } catch (e) {
    if (isUniqueViolation(e))
      throw await duplicateError(input.studentId, input.courseId);
    throw e;
  }
}

export async function updateEnrollment(
  id: string,
  input: UpdateEnrollmentInput,
) {
  const existing = await prisma.enrollment.findUnique({
    where: { id },
    select: { studentId: true, courseId: true },
  });
  if (!existing) throw httpError(404, "Enrollment not found");

  const data: Prisma.EnrollmentUncheckedUpdateInput = {};
  if (input.status) data.status = input.status;

  const newCourseId =
    input.courseId !== existing.courseId ? input.courseId : undefined;
  if (newCourseId) {
    await assertEnrollableCourse(newCourseId);
    data.courseId = newCourseId;
  }

  try {
    const enrollment = await prisma.enrollment.update({
      where: { id },
      data,
      include: enrollmentInclude,
    });
    return toEnrollmentDto(enrollment);
  } catch (e) {
    if (newCourseId && isUniqueViolation(e)) {
      throw await duplicateError(existing.studentId, newCourseId);
    }
    throw e;
  }
}

export async function deleteEnrollment(id: string) {
  const { count } = await prisma.enrollment.deleteMany({ where: { id } });
  if (count === 0) throw httpError(404, "Enrollment not found");
}

async function assertEnrollableStudent(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  });
  if (!user || user.role !== "student") {
    throw httpError(400, "Only users with the student role can be enrolled");
  }
  if (user.status !== "active")
    throw httpError(400, "This student account is not active");
}

async function assertEnrollableCourse(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true },
  });
  if (!course) throw httpError(400, "Course not found");
  if (course.status === "inactive") {
    throw httpError(400, "Can't enroll students in an inactive course");
  }
}

async function duplicateError(studentId: string, courseId: string) {
  const existing = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
    select: { status: true },
  });
  const status = existing ? ` (status: ${existing.status})` : "";
  return httpError(
    409,
    `This student is already enrolled in that course${status}.`,
  );
}

export function toEnrollmentDto(enrollment: EnrollmentWithRelations) {
  return {
    id: enrollment.id,
    status: enrollment.status,
    enrolledAt: enrollment.enrolledAt,
    student: enrollment.student,
    course: enrollment.course,
  };
}
