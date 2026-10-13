import { Router } from "express";
import * as ctrl from "./schedule.controller";
import { requireAuth, requirePermission } from "@/middleware/auth";
import { idParamSchema, validate } from "@/middleware/validate";
import { createScheduleSchema, updateScheduleSchema } from "./schedule.schema";

const r = Router();

r.use(requireAuth);

// Reads are scoped by role in the service
// GET /api/schedule?from=2026-09-07T00:00:00Z&to=2026-09-14T00:00:00Z&courseId=&teacherId=&studentId=
r.get("/", ctrl.list);
r.get("/:id", validate(idParamSchema, "params"), ctrl.get);

// Only admins manage the timetable for now
r.post("/", requirePermission("schedule.manage"), validate(createScheduleSchema), ctrl.create);
r.patch(
  "/:id",
  requirePermission("schedule.manage"),
  validate(idParamSchema, "params"),
  validate(updateScheduleSchema),
  ctrl.update,
);
r.delete(
  "/:id",
  requirePermission("schedule.manage"),
  validate(idParamSchema, "params"),
  ctrl.remove,
);

export default r;
