import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/db';
import type { JwtPayload } from '@/utils/jwt';
import { httpError } from '@/utils/errors';
import type { CreateLessonInput, UpdateLessonInput } from './lessons.schema';

const lessonSelect = {
  id: true,
  courseId: true,
  title: true,
  content: true,
  videoUrl: true,
  position: true,
  published: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LessonSelect;

async function loadCourse(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { teacherId: true, status: true },
  });
  if (!course) throw httpError(404, 'Course not found');
  return course;
}

// Admins manage every course's lessons; teachers only the courses they teach
async function assertCanManage(courseId: string, actor: JwtPayload) {
  const course = await loadCourse(courseId);
  if (actor.role === 'admin') return;
  if (actor.role === 'teacher' && course.teacherId === actor.sub) return;
  throw httpError(403, 'You can only manage lessons in your own courses');
}

// Students only see published lessons, and only for published courses they're actively enrolled in
async function assertCanView(courseId: string, actor: JwtPayload) {
  const course = await loadCourse(courseId);
  if (actor.role === 'admin') return { publishedOnly: false };
  if (actor.role === 'teacher') {
    if (course.teacherId !== actor.sub) {
      throw httpError(403, 'You can only view lessons in your own courses');
    }
    return { publishedOnly: false };
  }
  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId: actor.sub, courseId } },
    select: { status: true },
  });
  if (course.status !== 'published' || enrollment?.status !== 'active') {
    throw httpError(403, "You're not enrolled in this course");
  }
  return { publishedOnly: true };
}

export async function listLessons(courseId: string, actor: JwtPayload) {
  const { publishedOnly } = await assertCanView(courseId, actor);
  const data = await prisma.lesson.findMany({
    where: { courseId, ...(publishedOnly && { published: true }) },
    select: lessonSelect,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  return { data };
}

export async function getLesson(courseId: string, lessonId: string, actor: JwtPayload) {
  const { publishedOnly } = await assertCanView(courseId, actor);
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, courseId, ...(publishedOnly && { published: true }) },
    select: lessonSelect,
  });
  if (!lesson) throw httpError(404, 'Lesson not found');
  return lesson;
}

export async function createLesson(courseId: string, input: CreateLessonInput, actor: JwtPayload) {
  await assertCanManage(courseId, actor);
  // New lessons go to the end of the course
  const { _max } = await prisma.lesson.aggregate({
    where: { courseId },
    _max: { position: true },
  });
  return prisma.lesson.create({
    data: { ...input, courseId, position: (_max.position ?? 0) + 1 },
    select: lessonSelect,
  });
}

export async function updateLesson(
  courseId: string,
  lessonId: string,
  input: UpdateLessonInput,
  actor: JwtPayload,
) {
  await assertCanManage(courseId, actor);
  const existing = await prisma.lesson.findFirst({
    where: { id: lessonId, courseId },
    select: { id: true },
  });
  if (!existing) throw httpError(404, 'Lesson not found');
  return prisma.lesson.update({ where: { id: lessonId }, data: input, select: lessonSelect });
}

export async function deleteLesson(courseId: string, lessonId: string, actor: JwtPayload) {
  await assertCanManage(courseId, actor);
  const { count } = await prisma.lesson.deleteMany({ where: { id: lessonId, courseId } });
  if (count === 0) throw httpError(404, 'Lesson not found');
}

export async function reorderLessons(courseId: string, lessonIds: string[], actor: JwtPayload) {
  await assertCanManage(courseId, actor);

  const existing = await prisma.lesson.findMany({ where: { courseId }, select: { id: true } });
  const existingIds = new Set(existing.map((lesson) => lesson.id));
  if (lessonIds.length !== existingIds.size || lessonIds.some((id) => !existingIds.has(id))) {
    throw httpError(400, 'Send every lesson in this course exactly once, in the new order');
  }

  // A single UPDATE applies the whole new order atomically, without a transaction
  // (batch transactions have timed out over the Neon connection)
  const rows = Prisma.join(
    lessonIds.map((id, index) => Prisma.sql`(${id}::uuid, ${index + 1}::int)`),
  );
  await prisma.$executeRaw`
    UPDATE lessons AS l
    SET position = v.position, updated_at = now()
    FROM (VALUES ${rows}) AS v(id, position)
    WHERE l.id = v.id AND l.course_id = ${courseId}::uuid`;

  return listLessons(courseId, actor);
}
