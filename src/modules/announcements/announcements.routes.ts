import { Router } from "express";
import * as ctrl from "./announcements.controller";
import { requireAuth, requirePermission } from "@/middleware/auth";
import { idParamSchema, validate } from "@/middleware/validate";
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from "./announcements.schema";

const r = Router();

r.use(requireAuth);

r.get("/", ctrl.list);
r.get("/:id", validate(idParamSchema, "params"), ctrl.get);

const canWrite = requirePermission(
  "announcements.manage",
  "announcements.manage_own",
);

r.post("/", canWrite, validate(createAnnouncementSchema), ctrl.create);
r.patch(
  "/:id",
  canWrite,
  validate(idParamSchema, "params"),
  validate(updateAnnouncementSchema),
  ctrl.update,
);
r.delete("/:id", canWrite, validate(idParamSchema, "params"), ctrl.remove);

export default r;
