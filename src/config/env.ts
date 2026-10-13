import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  MAIL_FROM: z.string(),
  PORT: z.coerce.number().default(4000),
  UPLOAD_DIR: z.string().default("uploads"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export const env = schema.parse(process.env);
