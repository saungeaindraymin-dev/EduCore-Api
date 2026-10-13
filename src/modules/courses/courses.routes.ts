import { Router } from "express";
import * as ctrl from "./courses.controller";
import { idParamSchema, validate } from "@/middleware/validate";
import { requireAuth, requirePermission } from "@/middleware/auth";
import { createCourseSchema, updateCourseSchema } from "./courses.schema";
import lessonsRoutes from "@/modules/lessons/lessons.routes";
import courseAssignmentsRoutes from "@/modules/assignments/course-assignments.routes";
import courseQuizzesRoutes from "@/modules/quizzes/course-quizzes.routes";

const r = Router();

r.use(requireAuth);

r.use("/:courseId/lessons", lessonsRoutes);

r.use("/:courseId/assignments", courseAssignmentsRoutes);

r.use("/:courseId/quizzes", courseQuizzesRoutes);

r.get("/", ctrl.list);
r.get("/:id", validate(idParamSchema, "params"), ctrl.get);

r.post(
  "/",
  requirePermission("courses.manage"),
  validate(createCourseSchema),
  ctrl.create,
);
r.patch(
  "/:id",
  requirePermission("courses.manage", "courses.edit_own"),
  validate(idParamSchema, "params"),
  validate(updateCourseSchema),
  ctrl.update,
);
r.delete(
  "/:id",
  requirePermission("courses.manage"),
  validate(idParamSchema, "params"),
  ctrl.remove,
);

export default r;
