import { z } from "zod";

export const MAX_CLASS_HOURS = 12;
const MAX_RANGE_DAYS = 62;
const HOUR_MS = 60 * 60 * 1000;

// ISO 8601 with Z or an offset, e.g. 2026-09-11T09:00:00.000Z
const timestamp = z.iso.datetime({ offset: true });
const rangeBound = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

const hasFields = (v: object) => Object.keys(v).length > 0;
const endAfterStart = (v: { start?: string; end?: string }) =>
  !v.start || !v.end || Date.parse(v.end) > Date.parse(v.start);
const withinMaxLength = (v: { start?: string; end?: string }) =>
  !v.start || !v.end || Date.parse(v.end) - Date.parse(v.start) <= MAX_CLASS_HOURS * HOUR_MS;

export const listScheduleQuery = z
  .object({
    from: rangeBound,
    to: rangeBound,
    courseId: z.uuid().optional(),
    teacherId: z.uuid().optional(),
    studentId: z.uuid().optional(),
  })
  .refine((v) => Date.parse(v.to) > Date.parse(v.from), {
    path: ["to"],
    message: "`to` must be after `from`",
  })
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= MAX_RANGE_DAYS * 24 * HOUR_MS, {
    path: ["to"],
    message: `The range can't be longer than ${MAX_RANGE_DAYS} days`,
  });

export const createScheduleSchema = z
  .object({
    courseId: z.uuid(),
    teacherId: z.uuid().optional(), // defaults to the course's teacher
    title: z.string().trim().min(1).max(200).optional(), // defaults to the course title
    start: timestamp,
    end: timestamp,
    location: z.string().trim().max(120).optional(),
    repeatWeeks: z.number().int().min(1).max(26).default(1),
  })
  .refine(endAfterStart, { path: ["end"], message: "End must be after start" })
  .refine(withinMaxLength, {
    path: ["end"],
    message: `A class can't be longer than ${MAX_CLASS_HOURS} hours`,
  });

export const updateScheduleSchema = z
  .object({
    courseId: z.uuid(),
    teacherId: z.uuid().nullable(), // null = use the course's teacher
    title: z.string().trim().min(1).max(200),
    start: timestamp,
    end: timestamp,
    location: z.string().trim().max(120).nullable(),
  })
  .partial()
  .refine(hasFields, { message: "Provide at least one field to update" })
  .refine(endAfterStart, { path: ["end"], message: "End must be after start" })
  .refine(withinMaxLength, {
    path: ["end"],
    message: `A class can't be longer than ${MAX_CLASS_HOURS} hours`,
  });

export type ListScheduleQuery = z.infer<typeof listScheduleQuery>;
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
