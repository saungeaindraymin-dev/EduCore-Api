import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/db";
import type { JwtPayload } from "@/utils/jwt";
import { httpError } from "@/utils/errors";
import type {
  AnnouncementStatus,
  CreateAnnouncementInput,
  ListAnnouncementsQuery,
  UpdateAnnouncementInput,
} from "./announcements.schema";

const announcementInclude = {
  course: { select: { id: true, title: true, code: true } },
  author: { select: { id: true, name: true } },
} satisfies Prisma.AnnouncementInclude;

type AnnouncementWithRelations = Prisma.AnnouncementGetPayload<{
  include: typeof announcementInclude;
}>;

function statusWhere(
  status: AnnouncementStatus,
  now: Date,
): Prisma.AnnouncementWhereInput {
  if (status === "draft") return { publishedAt: null };
  if (status === "scheduled") return { publishedAt: { gt: now } };
  return { publishedAt: { lte: now } };
}

function scopeFor(actor: JwtPayload, now: Date): Prisma.AnnouncementWhereInput {
  if (actor.role === "admin") return {};
  const published = statusWhere("published", now);
  if (actor.role === "teacher") {
    return {
      OR: [
        { authorId: actor.sub },
        {
          AND: [
            published,
            {
              OR: [
                { audience: { in: ["all", "teachers"] } },
                { audience: "course", course: { teacherId: actor.sub } },
              ],
            },
          ],
        },
      ],
    };
  }
  return {
    AND: [
      published,
      {
        OR: [
          { audience: { in: ["all", "students"] } },
          {
            audience: "course",
            course: {
              enrollments: { some: { studentId: actor.sub, status: "active" } },
            },
          },
        ],
      },
    ],
  };
}

export async function listAnnouncements(
  { q, status, audience, courseId, page, pageSize }: ListAnnouncementsQuery,
  actor: JwtPayload,
) {
  const now = new Date();
  const filters: Prisma.AnnouncementWhereInput = status
    ? statusWhere(status, now)
    : {};
  if (audience) filters.audience = audience;
  if (courseId) filters.courseId = courseId;
  if (q) {
    filters.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { body: { contains: q, mode: "insensitive" } },
    ];
  }
  const where: Prisma.AnnouncementWhereInput = {
    AND: [scopeFor(actor, now), filters],
  };

  const [rows, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      include: announcementInclude,
      orderBy: [
        { publishedAt: { sort: "desc", nulls: "first" } },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.announcement.count({ where }),
  ]);

  return {
    data: rows.map((row) => toAnnouncementDto(row, now)),
    meta: { page, pageSize, total },
  };
}

export async function getAnnouncement(id: string, actor: JwtPayload) {
  const now = new Date();
  const announcement = await prisma.announcement.findFirst({
    where: { AND: [{ id }, scopeFor(actor, now)] },
    include: announcementInclude,
  });
  if (!announcement) throw httpError(404, "Announcement not found");
  return toAnnouncementDto(announcement, now);
}

export async function createAnnouncement(
  input: CreateAnnouncementInput,
  actor: JwtPayload,
) {
  const courseId =
    input.audience === "course" ? (input.courseId ?? null) : null;
  if (actor.role !== "admin")
    await assertOwnCourseAudience(input.audience, courseId, actor);
  if (courseId) await assertAnnounceableCourse(courseId);

  const announcement = await prisma.announcement.create({
    data: {
      title: input.title,
      body: input.body,
      audience: input.audience,
      courseId,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      authorId: actor.sub,
    },
    include: announcementInclude,
  });
  return toAnnouncementDto(announcement, new Date());
}

export async function updateAnnouncement(
  id: string,
  input: UpdateAnnouncementInput,
  actor: JwtPayload,
) {
  const existing = await prisma.announcement.findUnique({
    where: { id },
    select: { audience: true, courseId: true, authorId: true },
  });
  if (!existing) throw httpError(404, "Announcement not found");
  if (actor.role !== "admin" && existing.authorId !== actor.sub) {
    throw httpError(403, "You can only edit announcements you posted");
  }

  const audience = input.audience ?? existing.audience;
  const courseId =
    audience === "course"
      ? input.courseId !== undefined
        ? input.courseId
        : existing.courseId
      : null;
  if (audience === "course") {
    if (!courseId)
      throw httpError(400, "Choose a course for a course announcement");
    if (courseId !== existing.courseId)
      await assertAnnounceableCourse(courseId);
  }

  if (actor.role !== "admin")
    await assertOwnCourseAudience(audience, courseId, actor);

  const data: Prisma.AnnouncementUncheckedUpdateInput = { audience, courseId };
  if (input.title !== undefined) data.title = input.title;
  if (input.body !== undefined) data.body = input.body;
  if (input.publishedAt !== undefined) {
    data.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
  }

  const announcement = await prisma.announcement.update({
    where: { id },
    data,
    include: announcementInclude,
  });
  return toAnnouncementDto(announcement, new Date());
}

export async function deleteAnnouncement(id: string, actor: JwtPayload) {
  const existing = await prisma.announcement.findUnique({
    where: { id },
    select: { authorId: true },
  });
  if (!existing) throw httpError(404, "Announcement not found");
  if (actor.role !== "admin" && existing.authorId !== actor.sub) {
    throw httpError(403, "You can only delete announcements you posted");
  }
  await prisma.announcement.delete({ where: { id } });
}

async function assertOwnCourseAudience(
  audience: string,
  courseId: string | null,
  actor: JwtPayload,
) {
  if (audience !== "course" || !courseId) {
    throw httpError(403, "You can only announce to a course you teach");
  }
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { teacherId: true },
  });
  if (!course) throw httpError(400, "Course not found");
  if (course.teacherId !== actor.sub) {
    throw httpError(403, "You can only announce to a course you teach");
  }
}

async function assertAnnounceableCourse(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true },
  });
  if (!course) throw httpError(400, "Course not found");
  if (course.status === "inactive") {
    throw httpError(400, "Can't post announcements to an inactive course");
  }
}

export function toAnnouncementDto(
  announcement: AnnouncementWithRelations,
  now: Date,
) {
  const { publishedAt } = announcement;
  const status: AnnouncementStatus = !publishedAt
    ? "draft"
    : publishedAt > now
      ? "scheduled"
      : "published";
  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    audience: announcement.audience,
    course: announcement.course,
    publishedAt,
    status,
    author: announcement.author,
    createdAt: announcement.createdAt,
    updatedAt: announcement.updatedAt,
  };
}
