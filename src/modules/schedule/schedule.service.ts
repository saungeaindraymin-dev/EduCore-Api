import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/db';
import type { JwtPayload } from '@/utils/jwt';
import { httpError } from '@/utils/errors';
import {
  MAX_CLASS_HOURS,
  type CreateScheduleInput,
  type ListScheduleQuery,
  type UpdateScheduleInput,
} from './schedule.schema';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const eventInclude = {
  course: { select: { id: true, title: true, code: true } },
  teacher: { select: { id: true, name: true } },
} satisfies Prisma.ScheduleEventInclude;

type EventWithRelations = Prisma.ScheduleEventGetPayload<{ include: typeof eventInclude }>;
type Slot = { start: Date; end: Date };

// Admins see everything; teachers see classes they teach or that belong to their courses;
// students see classes for courses they're actively enrolled in. ANDed with request filters.
function scopeFor(actor: JwtPayload): Prisma.ScheduleEventWhereInput {
  if (actor.role === 'teacher') {
    return { OR: [{ teacherId: actor.sub }, { course: { teacherId: actor.sub } }] };
  }
  if (actor.role === 'student') {
    return { course: { enrollments: { some: { studentId: actor.sub, status: 'active' } } } };
  }
  return {};
}

export async function listSchedule(
  { from, to, courseId, teacherId, studentId }: ListScheduleQuery,
  actor: JwtPayload,
) {
  // Every class that overlaps the requested range
  const filters: Prisma.ScheduleEventWhereInput = {
    startsAt: { lt: new Date(to) },
    endsAt: { gt: new Date(from) },
  };
  if (courseId) filters.courseId = courseId;
  if (teacherId) filters.teacherId = teacherId;
  if (studentId) {
    filters.course = { enrollments: { some: { studentId, status: 'active' } } };
  }

  const rows = await prisma.scheduleEvent.findMany({
    where: { AND: [scopeFor(actor), filters] },
    include: eventInclude,
    orderBy: { startsAt: 'asc' },
    take: 1000,
  });

  return { data: rows.map(toEventDto) };
}

export async function getScheduleEvent(id: string, actor: JwtPayload) {
  const event = await prisma.scheduleEvent.findFirst({
    where: { AND: [{ id }, scopeFor(actor)] },
    include: eventInclude,
  });
  if (!event) throw httpError(404, 'Class not found');
  return toEventDto(event);
}

export async function createScheduleEvents(input: CreateScheduleInput) {
  const course = await getSchedulableCourse(input.courseId);
  const teacherId = input.teacherId ?? course.teacherId;
  if (!teacherId) throw httpError(400, 'This course has no teacher — choose one for the class');
  const teacher = await assertTeacher(teacherId);

  // Weekly repeats step by exactly 7 days (UTC)
  const start = new Date(input.start);
  const end = new Date(input.end);
  const slots: Slot[] = Array.from({ length: input.repeatWeeks }, (_, i) => ({
    start: new Date(start.getTime() + i * WEEK_MS),
    end: new Date(end.getTime() + i * WEEK_MS),
  }));
  const location = input.location || null;

  // Check every week up front so a conflicting series creates nothing
  await assertNoConflict(slots, teacherId, location);

  // A single INSERT … RETURNING is atomic on its own. A $transaction here hit Prisma's
  // 5s transaction timeout (P2028) over the slow Neon connection.
  const title = input.title || course.title;
  const rows = await prisma.scheduleEvent.createManyAndReturn({
    data: slots.map((slot) => ({
      courseId: input.courseId,
      teacherId,
      title,
      startsAt: slot.start,
      endsAt: slot.end,
      location,
    })),
  });

  const courseRef = { id: course.id, title: course.title, code: course.code };
  return rows
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((row) => toEventDto({ ...row, course: courseRef, teacher }));
}

export async function updateScheduleEvent(id: string, input: UpdateScheduleInput) {
  const existing = await prisma.scheduleEvent.findUnique({ where: { id } });
  if (!existing) throw httpError(404, 'Class not found');

  const courseId = input.courseId ?? existing.courseId;
  const courseChanged = courseId !== existing.courseId;
  const course = courseChanged ? await getSchedulableCourse(courseId) : null;

  // Explicit teacher wins; null (or moving to another course) means "the course's teacher"
  let teacherId = existing.teacherId;
  if (input.teacherId) {
    teacherId = input.teacherId;
  } else if (input.teacherId === null || courseChanged) {
    const courseTeacherId = course
      ? course.teacherId
      : (await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true } }))
          ?.teacherId;
    if (!courseTeacherId) {
      throw httpError(400, 'This course has no teacher — choose one for the class');
    }
    teacherId = courseTeacherId;
  }
  if (teacherId && teacherId !== existing.teacherId) await assertTeacher(teacherId);

  const start = input.start ? new Date(input.start) : existing.startsAt;
  const end = input.end ? new Date(input.end) : existing.endsAt;
  assertValidSlot(start, end);

  const location = input.location === undefined ? existing.location : input.location || null;
  await assertNoConflict([{ start, end }], teacherId, location, id);

  const event = await prisma.scheduleEvent.update({
    where: { id },
    data: {
      courseId,
      teacherId,
      title: input.title ?? existing.title,
      startsAt: start,
      endsAt: end,
      location,
    },
    include: eventInclude,
  });
  return toEventDto(event);
}

export async function deleteScheduleEvent(id: string) {
  const { count } = await prisma.scheduleEvent.deleteMany({ where: { id } });
  if (count === 0) throw httpError(404, 'Class not found');
}

async function getSchedulableCourse(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, code: true, status: true, teacherId: true },
  });
  if (!course) throw httpError(400, 'Course not found');
  if (course.status === 'inactive') {
    throw httpError(400, "Can't schedule classes for an inactive course");
  }
  return course;
}

async function assertTeacher(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, status: true },
  });
  if (!user || user.role !== 'teacher') {
    throw httpError(400, 'The assigned teacher must have the teacher role');
  }
  if (user.status !== 'active') throw httpError(400, 'The assigned teacher account is not active');
  return { id: user.id, name: user.name };
}

function assertValidSlot(start: Date, end: Date) {
  if (end <= start) throw httpError(400, 'End must be after start');
  if (end.getTime() - start.getTime() > MAX_CLASS_HOURS * 60 * 60 * 1000) {
    throw httpError(400, `A class can't be longer than ${MAX_CLASS_HOURS} hours`);
  }
}

// 409 if the teacher or the location (case-insensitive) is already booked in any slot.
// Back-to-back classes don't overlap (end == next start is fine).
async function assertNoConflict(
  slots: Slot[],
  teacherId: string | null,
  location: string | null,
  excludeId?: string,
) {
  const clashes: Prisma.ScheduleEventWhereInput[] = [];
  if (teacherId) clashes.push({ teacherId });
  if (location) clashes.push({ location: { equals: location, mode: 'insensitive' } });
  if (clashes.length === 0) return;

  const conflict = await prisma.scheduleEvent.findFirst({
    where: {
      AND: [
        { OR: slots.map((s) => ({ startsAt: { lt: s.end }, endsAt: { gt: s.start } })) },
        { OR: clashes },
        ...(excludeId ? [{ id: { not: excludeId } }] : []),
      ],
    },
    include: eventInclude,
    orderBy: { startsAt: 'asc' },
  });
  if (!conflict) return;

  const other = `"${conflict.title}" (${conflict.course.code})`;
  if (teacherId && conflict.teacherId === teacherId) {
    throw httpError(409, `${conflict.teacher?.name ?? 'This teacher'} is already teaching ${other} at that time`);
  }
  throw httpError(409, `${conflict.location} is already booked for ${other} at that time`);
}

export function toEventDto(event: EventWithRelations) {
  return {
    id: event.id,
    title: event.title,
    start: event.startsAt,
    end: event.endsAt,
    location: event.location,
    course: event.course,
    teacher: event.teacher,
    createdAt: event.createdAt,
  };
}
