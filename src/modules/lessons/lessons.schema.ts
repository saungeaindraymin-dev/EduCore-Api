import { z } from "zod";

export const courseParams = z.object({ courseId: z.uuid() });
export const lessonParams = z.object({ courseId: z.uuid(), lessonId: z.uuid() });

const title = z.string().trim().min(2).max(200);
const content = z.string().max(50_000);
// A link out to the video. http(s) only, so a lesson can never carry a javascript: URL.
// An empty string clears it.
const videoUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || /^https?:\/\/[^\s]+$/i.test(value), {
    message: "Use a full http(s) link, like https://youtu.be/…",
  })
  .transform((value) => (value === "" ? null : value))
  .nullable();

const hasFields = (v: object) => Object.keys(v).length > 0;

export const createLessonSchema = z.object({
  title,
  content: content.default(""),
  videoUrl: videoUrl.optional(),
  published: z.boolean().default(false),
});

export const updateLessonSchema = z
  .object({ title, content, videoUrl, published: z.boolean() })
  .partial()
  .refine(hasFields, { message: "Provide at least one field to update" });

// The full list of the course's lesson ids, in the new order
export const reorderLessonsSchema = z
  .object({ lessonIds: z.array(z.uuid()).min(1).max(500) })
  .refine((v) => new Set(v.lessonIds).size === v.lessonIds.length, {
    path: ["lessonIds"],
    message: "Each lesson id can only appear once",
  });

export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
