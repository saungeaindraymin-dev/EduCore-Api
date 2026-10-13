import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/db';
import type { JwtPayload } from '@/utils/jwt';
import type { ListStudentsQuery } from './students.schema';

// One row per student, with the enrollments the actor is allowed to see.
// Teachers only ever see students enrolled in a course they teach; admins see every student.
function enrollmentScopeFor(actor: JwtPayload): Prisma.EnrollmentWhereInput {
  if (actor.role === 'teacher') return { course: { teacherId: actor.sub } };
  return {};
}

const studentSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function listStudents(
  { q, courseId, status, page, pageSize }: ListStudentsQuery,
  actor: JwtPayload,
) {
  // Scope AND filters: a filter can narrow what's visible, never widen it
  const enrollmentWhere: Prisma.EnrollmentWhereInput = { AND: [enrollmentScopeFor(actor)] };
  if (courseId) enrollmentWhere.courseId = courseId;
  if (status) enrollmentWhere.status = status;

  const where: Prisma.UserWhereInput = { role: 'student' };
  // Admins also see students who aren't enrolled anywhere — unless they filter by course/status
  if (actor.role === 'teacher' || courseId || status) {
    where.enrollments = { some: enrollmentWhere };
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        ...studentSelect,
        enrollments: {
          where: enrollmentWhere,
          select: {
            id: true,
            status: true,
            enrolledAt: true,
            course: { select: { id: true, title: true, code: true } },
          },
          orderBy: { enrolledAt: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { data: rows.map(toStudentDto), meta: { page, pageSize, total } };
}

type StudentRow = Prisma.UserGetPayload<{
  select: typeof studentSelect & {
    enrollments: {
      select: {
        id: true;
        status: true;
        enrolledAt: true;
        course: { select: { id: true; title: true; code: true } };
      };
    };
  };
}>;

function toStudentDto(student: StudentRow) {
  const courses = student.enrollments.map((e) => ({
    id: e.course.id,
    title: e.course.title,
    code: e.course.code,
    enrollmentId: e.id,
    enrollmentStatus: e.status,
    enrolledAt: e.enrolledAt,
  }));
  return {
    id: student.id,
    name: student.name,
    email: student.email,
    status: student.status,
    courses,
    activeCourses: courses.filter((c) => c.enrollmentStatus === 'active').length,
    // Most recent enrollment the actor can see, for the "joined" column
    lastEnrolledAt: courses[0]?.enrolledAt ?? null,
  };
}
