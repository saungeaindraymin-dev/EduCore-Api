import { z } from "zod";

// Enrollment statuses, same set as the enrollments module
const enrollmentStatus = z.enum(["active", "pending", "dropped"]);

export const listStudentsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  courseId: z.uuid().optional(),
  status: enrollmentStatus.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListStudentsQuery = z.infer<typeof listStudentsQuery>;
