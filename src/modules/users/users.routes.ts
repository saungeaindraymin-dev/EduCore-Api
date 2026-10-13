import { Router } from "express";
import * as ctrl from "./users.controller";
import { requireAuth, requirePermission } from "@/middleware/auth";
import { idParamSchema, validate } from "@/middleware/validate";
import { createUserSchema, updateUserSchema } from "./users.schema";

const r = Router();

r.use(requireAuth, requirePermission("users.manage"));

// GET /api/users?role=teacher&status=active&q=&page=1&pageSize=20
r.get("/", ctrl.list);
r.post("/", validate(createUserSchema), ctrl.create);
r.get("/:id", validate(idParamSchema, "params"), ctrl.get);
r.patch(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateUserSchema),
  ctrl.update,
);
r.delete("/:id", validate(idParamSchema, "params"), ctrl.remove);

export default r;
