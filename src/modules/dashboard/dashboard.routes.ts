import { Router } from "express";
import * as ctrl from "./dashboard.controller";
import { requireAuth, requirePermission } from "@/middleware/auth";

const r = Router();

r.use(requireAuth);

r.get("/admin", requirePermission("dashboard.admin"), ctrl.admin);

export default r;
