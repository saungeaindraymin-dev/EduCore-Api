import { z } from "zod";

export const COURSE_CATEGORIES = [
  "Mathematics",
  "Computer Science",
  "Science",
  "History",
  "Language",
  "Arts",
] as const;

const category = z.enum(COURSE_CATEGORIES);
const status = z.enum(["draft", "published", "inactive"]);
const title = z.string().trim().min(3).max(200);
const code = z.string().trim().min(2).max(30);

const hasFields = (v: object) => Object.keys(v).length > 0;

export const listCoursesQuery = z.object({
  q: z.string().trim().min(1).optional(),
  status: status.optional(),
  category: category.optional(),
  teacherId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createCourseSchema = z.object({
  title,
  code,
  category,
  // Courses are created by admins, who always pick the teacher
  teacherId: z.uuid(),
  description: z.string().trim().max(2000).optional(),
});

export const updateCourseSchema = z
  .object({
    title,
    code,
    category,
    teacherId: z.uuid(),
    description: z.string().trim().max(2000).nullable(),
    status,
  })
  .partial()
  .refine(hasFields, { message: "Provide at least one field to update" });

export type ListCoursesQuery = z.infer<typeof listCoursesQuery>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
