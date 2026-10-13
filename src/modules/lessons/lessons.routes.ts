import { Router } from "express";
import * as ctrl from "./lessons.controller";
import { requirePermission } from "@/middleware/auth";
import { validate } from "@/middleware/validate";
import {
  courseParams,
  createLessonSchema,
  lessonParams,
  reorderLessonsSchema,
  updateLessonSchema,
} from "./lessons.schema";

// Mounted at /api/courses/:courseId/lessons (requireAuth runs in the courses router).
// Course ownership and enrollment are checked in the service.
const r = Router({ mergeParams: true });

const canRead = requirePermission("lessons.manage", "lessons.manage_own", "lessons.view_enrolled");
const canWrite = requirePermission("lessons.manage", "lessons.manage_own");

r.get("/", canRead, validate(courseParams, "params"), ctrl.list);
r.post("/", canWrite, validate(courseParams, "params"), validate(createLessonSchema), ctrl.create);
// PUT /order { lessonIds: [...] } — every lesson in the course, in the new order
r.put("/order", canWrite, validate(courseParams, "params"), validate(reorderLessonsSchema), ctrl.reorder);
r.get("/:lessonId", canRead, validate(lessonParams, "params"), ctrl.get);
r.patch(
  "/:lessonId",
  canWrite,
  validate(lessonParams, "params"),
  validate(updateLessonSchema),
  ctrl.update,
);
r.delete("/:lessonId", canWrite, validate(lessonParams, "params"), ctrl.remove);

export default r;
