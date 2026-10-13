import { z } from "zod";

const audience = z.enum(["all", "teachers", "students", "course"]);
const status = z.enum(["draft", "scheduled", "published"]);
const title = z.string().trim().min(3).max(200);
const body = z.string().trim().min(1).max(10_000);
const publishedAt = z.iso.datetime({ offset: true }).nullable();

const hasFields = (v: object) => Object.keys(v).length > 0;

export const listAnnouncementsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  status: status.optional(),
  audience: audience.optional(),
  courseId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createAnnouncementSchema = z
  .object({
    title,
    body,
    audience,
    courseId: z.uuid().optional(),
    publishedAt: publishedAt.optional(),
  })
  .refine((v) => v.audience !== "course" || !!v.courseId, {
    path: ["courseId"],
    message: "Choose a course for a course announcement",
  });

export const updateAnnouncementSchema = z
  .object({ title, body, audience, courseId: z.uuid().nullable(), publishedAt })
  .partial()
  .refine(hasFields, { message: "Provide at least one field to update" });

export type AnnouncementStatus = z.infer<typeof status>;
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuery>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
