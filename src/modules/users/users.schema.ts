import { z } from "zod";

const role = z.enum(["admin", "teacher", "student"]);
const status = z.enum(["active", "inactive", "pending"]);

const name = z.string().trim().min(2).max(120);
const email = z.string().trim().email().max(255);
const password = z.string().min(8).max(128);

const hasFields = (v: object) => Object.keys(v).length > 0;

export const listUsersQuery = z.object({
  role: role.optional(),
  status: status.optional(),
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createUserSchema = z.object({
  name,
  email,
  password,
  role: role.default("student"),
  status: status.default("active"),
});

// No defaults here — a PATCH must only touch the fields it sends
export const updateUserSchema = z
  .object({ name, email, password, role, status })
  .partial()
  .refine(hasFields, { message: "Provide at least one field to update" });

export type ListUsersQuery = z.infer<typeof listUsersQuery>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
