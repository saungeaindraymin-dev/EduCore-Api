import { Router } from "express";
import * as ctrl from "./quizzes.controller";
import { requireAuth, requirePermission } from "@/middleware/auth";
import { validate } from "@/middleware/validate";
import {
  questionParams,
  questionSchema,
  quizParams,
  reorderQuestionsSchema,
  submitAttemptSchema,
  updateQuizSchema,
} from "./quizzes.schema";

// Mounted at /api/quizzes. Creation lives under /api/courses/:courseId/quizzes.
const r = Router();

r.use(requireAuth);

const canRead = requirePermission("quizzes.oversee", "quizzes.manage_own", "quizzes.take");
const canWrite = requirePermission("quizzes.oversee", "quizzes.manage_own");
// Questions and the marking key are the teacher's alone — admins can't touch them
const teacherOnly = requirePermission("quizzes.manage_own");

r.get("/", canRead, ctrl.list);
r.get("/:id", canRead, validate(quizParams, "params"), ctrl.get);
r.patch(
  "/:id",
  canWrite,
  validate(quizParams, "params"),
  validate(updateQuizSchema),
  ctrl.update,
);
r.delete("/:id", canWrite, validate(quizParams, "params"), ctrl.remove);

r.post(
  "/:id/questions",
  teacherOnly,
  validate(quizParams, "params"),
  validate(questionSchema),
  ctrl.addQuestion,
);
r.put(
  "/:id/questions/order",
  teacherOnly,
  validate(quizParams, "params"),
  validate(reorderQuestionsSchema),
  ctrl.reorderQuestions,
);
r.patch(
  "/:id/questions/:questionId",
  teacherOnly,
  validate(questionParams, "params"),
  validate(questionSchema),
  ctrl.updateQuestion,
);
r.delete(
  "/:id/questions/:questionId",
  teacherOnly,
  validate(questionParams, "params"),
  ctrl.removeQuestion,
);

// Students sit the quiz; it is marked on the spot
r.post(
  "/:id/attempts",
  requirePermission("quizzes.take"),
  validate(quizParams, "params"),
  validate(submitAttemptSchema),
  ctrl.submitAttempt,
);
// Teachers and admins see the whole class; a student sees only their own attempts
r.get("/:id/attempts", canRead, validate(quizParams, "params"), ctrl.listAttempts);

export default r;
