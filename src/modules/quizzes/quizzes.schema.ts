import { z } from "zod";

export const QUIZ_STATUSES = ["draft", "published", "closed"] as const;
export const QUESTION_TYPES = ["single", "multiple", "true_false"] as const;

const status = z.enum(QUIZ_STATUSES);
const title = z.string().trim().min(3).max(200);

export const courseParams = z.object({ courseId: z.uuid() });
export const quizParams = z.object({ id: z.uuid() });
export const questionParams = z.object({ id: z.uuid(), questionId: z.uuid() });

export const listQuizzesQuery = z.object({
  q: z.string().trim().min(1).optional(),
  courseId: z.uuid().optional(),
  teacherId: z.uuid().optional(),
  status: status.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createQuizSchema = z.object({
  title,
  description: z.string().trim().max(10_000).default(""),
  status: status.default("draft"),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
  timeLimitMinutes: z.coerce.number().int().min(1).max(600).nullable().optional(),
  attemptsAllowed: z.coerce.number().int().min(1).max(10).default(1),
});

export const updateQuizSchema = z
  .object({
    title,
    description: z.string().trim().max(10_000),
    status,
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    timeLimitMinutes: z.coerce.number().int().min(1).max(600).nullable(),
    attemptsAllowed: z.coerce.number().int().min(1).max(10),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update",
  });

// A question always ships with its options, so the marking key is never half-written
const optionInput = z.object({
  text: z.string().trim().min(1).max(500),
  isCorrect: z.boolean().default(false),
});

export const questionSchema = z
  .object({
    type: z.enum(QUESTION_TYPES).default("single"),
    text: z.string().trim().min(1).max(2000),
    points: z.coerce.number().int().min(1).max(100).default(1),
    options: z.array(optionInput).min(2).max(10),
  })
  .superRefine((v, ctx) => {
    const correct = v.options.filter((o) => o.isCorrect).length;
    if (correct === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Mark at least one option as correct — that's how it gets marked",
      });
    }
    if (v.type !== "multiple" && correct > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "This question type takes exactly one correct option",
      });
    }
    if (v.type === "true_false" && v.options.length !== 2) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "A true/false question needs exactly two options",
      });
    }
  });

export const reorderQuestionsSchema = z.object({
  questionIds: z.array(z.uuid()).min(1).max(200),
});

// What a student sends back: the option ids they picked per question
export const submitAttemptSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.uuid(),
        optionIds: z.array(z.uuid()).max(10),
      }),
    )
    .max(200),
});

export type ListQuizzesQuery = z.infer<typeof listQuizzesQuery>;
export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
