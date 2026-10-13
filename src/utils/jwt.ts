import jwt from "jsonwebtoken";
import { env } from "@/config/env";

export type JwtPayload = { sub: string; role: "admin" | "teacher" | "student" };

export const signToken = (payload: JwtPayload) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES });

export const verifyToken = (token: string) =>
  jwt.verify(token, env.JWT_SECRET) as JwtPayload;
