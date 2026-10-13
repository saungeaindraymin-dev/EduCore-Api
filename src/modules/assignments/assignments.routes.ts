import { Router } from "express";
import * as ctrl from "./assignments.controller";
import { requireAuth, requirePermission } from "@/middleware/auth";
import { acceptSubmissionFiles } from "@/middleware/upload";
import { validate } from "@/middleware/validate";
import {
  assignmentParams,
  gradeSubmissionSchema,
  submissionParams,
  submitWorkSchema,
  updateAssignmentSchema,
} from "./assignments.schema";

const r = Router();

r.use(requireAuth);

const canRead = requirePermission(
  "assignments.oversee",
  "assignments.manage_own",
  "assignments.view_enrolled",
);
const canWrite = requirePermission(
  "assignments.oversee",
  "assignments.manage_own",
);

r.get("/", canRead, ctrl.list);
r.get("/:id", canRead, validate(assignmentParams, "params"), ctrl.get);
r.patch(
  "/:id",
  canWrite,
  validate(assignmentParams, "params"),
  validate(updateAssignmentSchema),
  ctrl.update,
);
r.delete("/:id", canWrite, validate(assignmentParams, "params"), ctrl.remove);

r.post(
  "/:id/submissions",
  requirePermission("assignments.submit"),
  validate(assignmentParams, "params"),
  acceptSubmissionFiles,
  validate(submitWorkSchema),
  ctrl.submitWork,
);
r.get(
  "/:id/submissions",
  requirePermission(
    "assignments.oversee",
    "assignments.manage_own",
    "assignments.submit",
  ),
  validate(assignmentParams, "params"),
  ctrl.listSubmissions,
);

export default r;
