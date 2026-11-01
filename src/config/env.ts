import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  // Mail. All optional: with nothing filled in, development falls back to
  // MAIL_TRANSPORT=log (see utils/mailer.ts). Production refuses to boot without SMTP.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("EduCore <no-reply@educore.local>"),
  MAIL_TRANSPORT: z.enum(["auto", "smtp", "log", "ethereal"]).default("auto"),
  MAIL_OUTBOX_DIR: z.string().default(".mail"),
  PORT: z.coerce.number().default(4000),
  UPLOAD_DIR: z.string().default("uploads"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export const env = schema.parse(process.env);
