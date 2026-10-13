import { z } from "zod";

const status = z.enum(["active", "pending", "dropped"]);

const hasFields = (v: object) => Object.keys(v).length > 0;

export const listEnrollmentsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  status: status.optional(),
  courseId: z.uuid().optional(),
  studentId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createEnrollmentSchema = z.object({
  studentId: z.uuid(),
  courseId: z.uuid(),
  status: status.default("active"),
});

export const updateEnrollmentSchema = z
  .object({ courseId: z.uuid(), status })
  .partial()
  .refine(hasFields, { message: "Provide at least one field to update" });

export type ListEnrollmentsQuery = z.infer<typeof listEnrollmentsQuery>;
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;
