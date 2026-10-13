import type { Request, Response, NextFunction } from "express";
import * as service from "./students.service";
import { listStudentsQuery } from "./students.schema";

export const list = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = listStudentsQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "ValidationError",
      issues: parsed.error.issues,
    });
  }
  try {
    res.json(await service.listStudents(parsed.data, req.user!));
  } catch (e) {
    next(e);
  }
};
