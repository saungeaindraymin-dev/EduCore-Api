import { Router } from "express";
import * as ctrl from "./quizzes.controller";
import { requirePermission } from "@/middleware/auth";
import { validate } from "@/middleware/validate";
import { courseParams, createQuizSchema } from "./quizzes.schema";

// Mounted at /api/courses/:courseId/quizzes (requireAuth runs in the courses router)
const r = Router({ mergeParams: true });

r.get(
  "/",
  requirePermission("quizzes.oversee", "quizzes.manage_own", "quizzes.take"),
  validate(courseParams, "params"),
  ctrl.listForCourse,
);
r.post(
  "/",
  requirePermission("quizzes.manage_own"),
  validate(courseParams, "params"),
  validate(createQuizSchema),
  ctrl.create,
);

export default r;
