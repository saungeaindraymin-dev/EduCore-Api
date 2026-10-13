import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/db';
import { hash } from '@/utils/hash';
import { collectSubmissionFiles } from '@/utils/storage';
import { httpError, isUniqueViolation } from '@/utils/errors';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schema';

// Never select passwordHash in API responses
const publicFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export async function listUsers({ role, status, q, page, pageSize }: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {};
  if (role) where.role = role;
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: publicFields,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { data, meta: { page, pageSize, total } };
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicFields });
  if (!user) throw httpError(404, 'User not found');
  return user;
}

export async function createUser({ password, ...input }: CreateUserInput) {
  try {
    return await prisma.user.create({
      data: { ...input, passwordHash: await hash(password) },
      select: publicFields,
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw httpError(409, `Email "${input.email}" is already in use`);
    throw e;
  }
}

export async function updateUser(id: string, { password, ...input }: UpdateUserInput, actorId: string) {
  if (id === actorId) {
    if (input.role && input.role !== 'admin') throw httpError(400, "You can't change your own role");
    if (input.status && input.status !== 'active') {
      throw httpError(400, "You can't deactivate your own account");
    }
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: {
      role: true,
      _count: { select: { taughtCourses: true, scheduleEvents: true, enrollments: true } },
    },
  });
  if (!existing) throw httpError(404, 'User not found');

  const { taughtCourses, scheduleEvents } = existing._count;
  if (
    existing.role === 'teacher' &&
    input.role &&
    input.role !== 'teacher' &&
    taughtCourses + scheduleEvents > 0
  ) {
    throw httpError(
      409,
      `This teacher has ${taughtCourses} course(s) and ${scheduleEvents} scheduled class(es). Reassign them before changing the role.`,
    );
  }

  const enrollmentCount = existing._count.enrollments;
  if (existing.role === 'student' && input.role && input.role !== 'student' && enrollmentCount > 0) {
    throw httpError(
      409,
      `This student has ${enrollmentCount} enrollment(s). Remove them before changing the role.`,
    );
  }

  const data: Prisma.UserUpdateInput = { ...input };
  if (password) data.passwordHash = await hash(password);

  try {
    return await prisma.user.update({ where: { id }, data, select: publicFields });
  } catch (e) {
    if (isUniqueViolation(e)) throw httpError(409, `Email "${input.email}" is already in use`);
    throw e;
  }
}

export async function deleteUser(id: string, actorId: string) {
  if (id === actorId) throw httpError(400, "You can't delete your own account");
  // Enrollments/OTP codes/submissions cascade; courses they teach become unassigned
  // (teacher_id SET NULL). A student's handed-in files leave storage once the row is gone.
  const removeFiles = await collectSubmissionFiles({ submission: { studentId: id } });
  const { count } = await prisma.user.deleteMany({ where: { id } });
  if (count === 0) throw httpError(404, 'User not found');
  await removeFiles();
}
