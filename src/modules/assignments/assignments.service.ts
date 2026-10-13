import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/db";
import type { JwtPayload } from "@/utils/jwt";
import { httpError } from "@/utils/errors";
import {
  collectSubmissionFiles,
  deleteStoredFile,
  newStorageKey,
  putFile,
  readStoredFile,
} from "@/utils/storage";
import { ALLOWED_TYPES, MAX_FILES, extensionOf } from "@/middleware/upload";
import type {
  CreateAssignmentInput,
  GradeSubmissionInput,
  ListAssignmentsQuery,
  MySubmissionsQuery,
  SubmitWorkInput,
  UpdateAssignmentInput,
} from "./assignments.schema";

const assignmentInclude = {
  course: {
    select: {
      id: true,
      title: true,
      code: true,
      teacherId: true,
      _count: { select: { enrollments: { where: { status: "active" } } } },
    },
  },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { submissions: true } },
} satisfies Prisma.AssignmentInclude;

type AssignmentWithRelations = Prisma.AssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

function scopeFor(actor: JwtPayload): Prisma.AssignmentWhereInput {
  if (actor.role === "teacher") return { course: { teacherId: actor.sub } };
  if (actor.role === "student") {
    return {
      status: { in: ["published", "closed"] },
      course: {
        enrollments: { some: { studentId: actor.sub, status: "active" } },
      },
    };
  }
  return {};
}

export async function listAssignments(
  {
    q,
    courseId,
    teacherId,
    status,
    dueFrom,
    dueTo,
    page,
    pageSize,
  }: ListAssignmentsQuery,
  actor: JwtPayload,
) {
  const filters: Prisma.AssignmentWhereInput = {};
  if (courseId) filters.courseId = courseId;
  if (teacherId) filters.course = { teacherId };
  if (status) filters.status = status;
  if (dueFrom || dueTo) {
    filters.dueAt = {
      ...(dueFrom && { gte: new Date(dueFrom) }),
      ...(dueTo && { lte: new Date(dueTo) }),
    };
  }
  if (q) {
    filters.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { course: { title: { contains: q, mode: "insensitive" } } },
      { course: { code: { contains: q, mode: "insensitive" } } },
    ];
  }
  const where: Prisma.AssignmentWhereInput = {
    AND: [scopeFor(actor), filters],
  };

  const [rows, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      include: assignmentInclude,
      orderBy: [
        { dueAt: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.assignment.count({ where }),
  ]);

  return {
    data: rows.map((row) => toAssignmentDto(row, actor)),
    meta: { page, pageSize, total },
  };
}

export async function getAssignment(id: string, actor: JwtPayload) {
  const assignment = await prisma.assignment.findFirst({
    where: { AND: [{ id }, scopeFor(actor)] },
    include: assignmentInclude,
  });
  if (!assignment) throw httpError(404, "Assignment not found");
  return toAssignmentDto(assignment, actor);
}

export async function createAssignment(
  courseId: string,
  input: CreateAssignmentInput,
  actor: JwtPayload,
) {
  await assertTeachesCourse(courseId, actor);

  const assignment = await prisma.assignment.create({
    data: {
      courseId,
      title: input.title,
      description: input.description,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      totalPoints: input.totalPoints,
      status: input.status,
      createdById: actor.sub,
    },
    include: assignmentInclude,
  });
  return toAssignmentDto(assignment);
}

export async function updateAssignment(
  id: string,
  input: UpdateAssignmentInput,
  actor: JwtPayload,
) {
  const existing = await prisma.assignment.findUnique({
    where: { id },
    select: { course: { select: { teacherId: true } } },
  });
  if (!existing) throw httpError(404, "Assignment not found");

  if (actor.role === "admin") {
    const changes = Object.keys(input);
    if (changes.some((field) => field !== "status")) {
      throw httpError(
        403,
        "Only the course's teacher can edit assignment details — an admin can change its status",
      );
    }
  } else if (existing.course.teacherId !== actor.sub) {
    throw httpError(403, "You can only edit assignments in your own courses");
  }

  const { dueAt, ...rest } = input;
  const assignment = await prisma.assignment.update({
    where: { id },
    data: {
      ...rest,
      ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
    },
    include: assignmentInclude,
  });
  return toAssignmentDto(assignment);
}

export async function deleteAssignment(id: string, actor: JwtPayload) {
  const existing = await prisma.assignment.findUnique({
    where: { id },
    select: { course: { select: { teacherId: true } } },
  });
  if (!existing) throw httpError(404, "Assignment not found");
  // Admins can remove anything (moderation); teachers only their own courses' work
  if (actor.role !== "admin" && existing.course.teacherId !== actor.sub) {
    throw httpError(403, "You can only delete assignments in your own courses");
  }
  const removeFiles = await collectSubmissionFiles({
    submission: { assignmentId: id },
  });
  await prisma.assignment.delete({ where: { id } });
  await removeFiles();
}

export async function submitWork(
  assignmentId: string,
  input: SubmitWorkInput,
  uploads: Express.Multer.File[],
  actor: JwtPayload,
) {
  if (actor.role !== "student")
    throw httpError(403, "Only students hand work in");

  const assignment = await prisma.assignment.findFirst({
    where: { AND: [{ id: assignmentId }, scopeFor(actor)] },
    select: { id: true, status: true, dueAt: true, totalPoints: true },
  });
  if (!assignment) throw httpError(404, "Assignment not found");
  if (assignment.status !== "published") {
    throw httpError(400, "This assignment is closed for submissions");
  }

  const existing = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId: actor.sub } },
    select: {
      id: true,
      gradedAt: true,
      files: { select: { id: true, storageKey: true } },
    },
  });
  if (existing?.gradedAt) {
    throw httpError(
      409,
      "This work has been marked — ask your teacher if you need to change it",
    );
  }

  const current = existing?.files ?? [];
  const keep = new Set(input.keepFileIds);
  if ([...keep].some((id) => !current.some((file) => file.id === id))) {
    throw httpError(400, "That file isn't part of your submission");
  }
  const dropped = current.filter((file) => !keep.has(file.id));
  if (!input.content && keep.size + uploads.length === 0) {
    throw httpError(400, "Write an answer or attach a file");
  }
  if (keep.size + uploads.length > MAX_FILES) {
    throw httpError(400, `A submission can hold at most ${MAX_FILES} files`);
  }

  const stored = uploads.map((upload) => ({
    fileName: upload.originalname.slice(0, 255),
    mimeType: ALLOWED_TYPES[extensionOf(upload.originalname)],
    size: upload.size,
    storageKey: newStorageKey(`submissions/${assignmentId}`),
    bytes: upload.buffer,
  }));
  await Promise.all(stored.map((file) => putFile(file.storageKey, file.bytes)));

  let submissionId: string;
  try {
    const saved = await prisma.submission.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId: actor.sub } },
      create: { assignmentId, studentId: actor.sub, content: input.content },
      update: { content: input.content, submittedAt: new Date() },
      select: { id: true },
    });
    submissionId = saved.id;
    if (stored.length) {
      await prisma.submissionFile.createMany({
        data: stored.map(({ bytes: _bytes, ...file }) => ({
          ...file,
          submissionId,
        })),
      });
    }
    if (dropped.length) {
      await prisma.submissionFile.deleteMany({
        where: { id: { in: dropped.map((f) => f.id) } },
      });
    }
  } catch (e) {
    await Promise.all(
      stored.map((file) => deleteStoredFile(file.storageKey).catch(() => {})),
    );
    throw e;
  }
  await Promise.all(
    dropped.map((file) => deleteStoredFile(file.storageKey).catch(() => {})),
  );

  const submission = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: submissionInclude,
  });
  return toSubmissionDto(submission, assignment.dueAt);
}

export async function getSubmissionFile(
  submissionId: string,
  fileId: string,
  actor: JwtPayload,
) {
  const file = await prisma.submissionFile.findFirst({
    where: { id: fileId, submissionId },
    include: {
      submission: {
        select: {
          studentId: true,
          assignment: { select: { course: { select: { teacherId: true } } } },
        },
      },
    },
  });
  const allowed =
    !!file &&
    (actor.role === "admin" ||
      (actor.role === "teacher" &&
        file.submission.assignment.course.teacherId === actor.sub) ||
      (actor.role === "student" && file.submission.studentId === actor.sub));
  if (!file || !allowed) throw httpError(404, "File not found");

  const bytes = await readStoredFile(file.storageKey);
  if (!bytes) throw httpError(404, "This file is missing from storage");
  return { fileName: file.fileName, mimeType: file.mimeType, bytes };
}

export async function listSubmissions(assignmentId: string, actor: JwtPayload) {
  const assignment = await prisma.assignment.findFirst({
    where: { AND: [{ id: assignmentId }, scopeFor(actor)] },
    select: {
      id: true,
      dueAt: true,
      totalPoints: true,
      courseId: true,
      course: { select: { teacherId: true } },
    },
  });
  if (!assignment) throw httpError(404, "Assignment not found");

  const rows = await prisma.submission.findMany({
    where: {
      assignmentId,
      ...(actor.role === "student" ? { studentId: actor.sub } : {}),
    },
    include: submissionInclude,
    orderBy: { submittedAt: "desc" },
    take: 500,
  });
  const data = rows.map((row) => toSubmissionDto(row, assignment.dueAt));

  const graded = data.filter((row) => row.score !== null);
  const enrolled =
    actor.role === "student"
      ? undefined
      : await prisma.enrollment.count({
          where: { courseId: assignment.courseId, status: "active" },
        });

  return {
    data,
    meta: {
      submissions: data.length,
      graded: graded.length,
      awaitingMarking: data.length - graded.length,
      late: data.filter((row) => row.isLate).length,
      ...(enrolled === undefined
        ? {}
        : { enrolled, notSubmitted: Math.max(0, enrolled - data.length) }),
      totalPoints: assignment.totalPoints,
      averageScore: graded.length
        ? Math.round(
            graded.reduce((sum, row) => sum + (row.score ?? 0), 0) /
              graded.length,
          )
        : null,
    },
  };
}

export async function listMySubmissions(
  { graded, limit }: MySubmissionsQuery,
  actor: JwtPayload,
) {
  if (actor.role !== "student")
    throw httpError(403, "Only students have submissions of their own");

  const rows = await prisma.submission.findMany({
    where: {
      studentId: actor.sub,
      assignment: scopeFor(actor),
      ...(graded === "true" ? { gradedAt: { not: null } } : {}),
      ...(graded === "false" ? { gradedAt: null } : {}),
    },
    include: {
      ...submissionInclude,
      assignment: {
        select: {
          id: true,
          title: true,
          totalPoints: true,
          dueAt: true,
          course: { select: { id: true, title: true, code: true } },
        },
      },
    },
    orderBy: graded === "true" ? { gradedAt: "desc" } : { submittedAt: "desc" },
    take: limit,
  });

  return {
    data: rows.map((row) => ({
      ...toSubmissionDto(row, row.assignment.dueAt),
      assignment: {
        id: row.assignment.id,
        title: row.assignment.title,
        totalPoints: row.assignment.totalPoints,
        dueAt: row.assignment.dueAt,
        course: row.assignment.course,
      },
    })),
  };
}

export async function gradeSubmission(
  submissionId: string,
  input: GradeSubmissionInput,
  actor: JwtPayload,
) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: {
        select: {
          totalPoints: true,
          dueAt: true,
          course: { select: { teacherId: true } },
        },
      },
    },
  });
  if (!submission) throw httpError(404, "Submission not found");
  if (
    actor.role !== "teacher" ||
    submission.assignment.course.teacherId !== actor.sub
  ) {
    throw httpError(403, "Only the teacher who runs the course marks its work");
  }
  if (input.score > submission.assignment.totalPoints) {
    throw httpError(
      400,
      `This assignment is out of ${submission.assignment.totalPoints} points`,
    );
  }

  const graded = await prisma.submission.update({
    where: { id: submissionId },
    data: {
      score: input.score,
      feedback: input.feedback ?? null,
      gradedAt: new Date(),
      gradedById: actor.sub,
    },
    include: submissionInclude,
  });
  return toSubmissionDto(graded, submission.assignment.dueAt);
}

const submissionInclude = {
  student: { select: { id: true, name: true, email: true } },
  gradedBy: { select: { id: true, name: true } },
  files: {
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      size: true,
      uploadedAt: true,
    },
    orderBy: { uploadedAt: "asc" },
  },
} satisfies Prisma.SubmissionInclude;

type SubmissionWithRelations = Prisma.SubmissionGetPayload<{
  include: typeof submissionInclude;
}>;

function toSubmissionDto(
  submission: SubmissionWithRelations,
  dueAt: Date | null,
) {
  return {
    id: submission.id,
    assignmentId: submission.assignmentId,
    student: submission.student,
    content: submission.content,
    files: submission.files,
    score: submission.score,
    feedback: submission.feedback,
    submittedAt: submission.submittedAt,
    gradedAt: submission.gradedAt,
    gradedBy: submission.gradedBy,
    isLate: !!dueAt && submission.submittedAt > dueAt,
  };
}

async function assertTeachesCourse(courseId: string, actor: JwtPayload) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true, teacherId: true },
  });
  if (!course) throw httpError(404, "Course not found");
  if (actor.role !== "teacher" || course.teacherId !== actor.sub) {
    throw httpError(
      403,
      "Assignments are set by the teacher who runs the course",
    );
  }
  if (course.status === "inactive") {
    throw httpError(400, "Can't set assignments for an inactive course");
  }
}

export function toAssignmentDto(
  assignment: AssignmentWithRelations,
  actor?: JwtPayload,
) {
  const progress =
    actor?.role === "student"
      ? {}
      : {
          submissions: assignment._count.submissions,
          enrolled: assignment.course._count.enrollments,
        };
  return {
    ...progress,
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    dueAt: assignment.dueAt,
    totalPoints: assignment.totalPoints,
    status: assignment.status,
    course: {
      id: assignment.course.id,
      title: assignment.course.title,
      code: assignment.course.code,
    },
    createdBy: assignment.createdBy,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}
