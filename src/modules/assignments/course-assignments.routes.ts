import { Router } from "express";
import * as ctrl from "./assignments.controller";
import { requirePermission } from "@/middleware/auth";
import { validate } from "@/middleware/validate";
import { courseParams, createAssignmentSchema } from "./assignments.schema";

const r = Router({ mergeParams: true });

r.get(
  "/",
  requirePermission(
    "assignments.oversee",
    "assignments.manage_own",
    "assignments.view_enrolled",
  ),
  validate(courseParams, "params"),
  ctrl.listForCourse,
);
r.post(
  "/",
  requirePermission("assignments.manage_own"),
  validate(courseParams, "params"),
  validate(createAssignmentSchema),
  ctrl.create,
);

export default r;
