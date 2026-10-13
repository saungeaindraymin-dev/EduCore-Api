import type { RequestHandler } from "express";
import { verifyToken, type JwtPayload } from "@/utils/jwt";
import { hasPermission, type Permission } from "@/modules/access/access.config";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

export const requirePermission =
  (...anyOf: Permission[]): RequestHandler =>
  (req, res, next) => {
    const role = req.user?.role;
    if (!role || !anyOf.some((permission) => hasPermission(role, permission))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
