import { Prisma } from '@/generated/prisma/client';

// Picked up by middleware/error.ts, which responds with err.status
export const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

export const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
