import { Router } from "express";
import * as ctrl from "./assignments.controller";
import { requireAuth, requirePermission } from "@/middleware/auth";
import { validate } from "@/middleware/validate";
import {
  gradeSubmissionSchema,
  submissionFileParams,
  submissionParams,
} from "./assignments.schema";

// Mounted at /api/submissions. Marking belongs to the teacher who runs the course,
// which the service checks — an admin has no say in a score.
const r = Router();

r.use(requireAuth);

// A student's own work, with marks and feedback — GET /api/submissions/mine?graded=true
r.get("/mine", requirePermission("assignments.submit"), ctrl.listMySubmissions);

r.patch(
  "/:id/grade",
  requirePermission("assignments.manage_own"),
  validate(submissionParams, "params"),
  validate(gradeSubmissionSchema),
  ctrl.gradeSubmission,
);

// A handed-in file. The service allows the student who handed it in, the course's teacher
// and admins — anyone else gets a 404.
r.get(
  "/:id/files/:fileId",
  requirePermission("assignments.submit", "assignments.manage_own", "assignments.oversee"),
  validate(submissionFileParams, "params"),
  ctrl.downloadSubmissionFile,
);

export default r;
