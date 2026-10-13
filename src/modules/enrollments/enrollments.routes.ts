import { Router } from "express";
import * as ctrl from "./enrollments.controller";
import { requireAuth, requirePermission } from "@/middleware/auth";
import { idParamSchema, validate } from "@/middleware/validate";
import {
  createEnrollmentSchema,
  updateEnrollmentSchema,
} from "./enrollments.schema";

const r = Router();

r.use(requireAuth);


r.get("/", ctrl.list);
r.get("/:id", validate(idParamSchema, "params"), ctrl.get);

r.post(
  "/",
  requirePermission("enrollments.manage"),
  validate(createEnrollmentSchema),
  ctrl.create,
);
r.patch(
  "/:id",
  requirePermission("enrollments.manage"),
  validate(idParamSchema, "params"),
  validate(updateEnrollmentSchema),
  ctrl.update,
);
r.delete(
  "/:id",
  requirePermission("enrollments.manage"),
  validate(idParamSchema, "params"),
  ctrl.remove,
);

export default r;
