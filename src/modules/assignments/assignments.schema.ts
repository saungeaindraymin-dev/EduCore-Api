import { z } from "zod";

export const ASSIGNMENT_STATUSES = ["draft", "published", "closed"] as const;

const status = z.enum(ASSIGNMENT_STATUSES);
const title = z.string().trim().min(3).max(200);
const description = z.string().trim().max(20_000);
const totalPoints = z.coerce.number().int().min(1).max(1000);
const dueAt = z.iso.datetime({ offset: true }).nullable();

const hasFields = (v: object) => Object.keys(v).length > 0;

export const courseParams = z.object({ courseId: z.uuid() });
export const assignmentParams = z.object({ id: z.uuid() });

export const listAssignmentsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  courseId: z.uuid().optional(),
  teacherId: z.uuid().optional(), 
  status: status.optional(),
  dueFrom: z.iso.datetime({ offset: true }).optional(),
  dueTo: z.iso.datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createAssignmentSchema = z.object({
  title,
  description: description.default(""),
  dueAt: dueAt.optional(),
  totalPoints: totalPoints.default(100),
  status: status.default("draft"),
});

export const updateAssignmentSchema = z
  .object({ title, description, dueAt, totalPoints, status })
  .partial()
  .refine(hasFields, { message: "Provide at least one field to update" });

export const moderateAssignmentSchema = z.object({ status });

export const submissionParams = z.object({ id: z.uuid() });
export const submissionFileParams = z.object({
  id: z.uuid(),
  fileId: z.uuid(),
});

const jsonList = (value: unknown) => {
  if (typeof value !== "string") return value;
  if (value.trim() === "") return [];
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};


export const submitWorkSchema = z.object({
  content: z.string().trim().max(50_000).default(""),
  keepFileIds: z.preprocess(jsonList, z.array(z.uuid()).max(5)).default([]),
});

export const gradeSubmissionSchema = z.object({
  score: z.coerce.number().int().min(0),
  feedback: z.string().trim().max(5_000).nullable().optional(),
});


export const mySubmissionsQuery = z.object({
  graded: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SubmitWorkInput = z.infer<typeof submitWorkSchema>;
export type MySubmissionsQuery = z.infer<typeof mySubmissionsQuery>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuery>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
