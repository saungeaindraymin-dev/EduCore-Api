import { Router } from "express";
import * as ctrl from "./access.controller";
import { requireAuth } from "@/middleware/auth";

const r = Router();

r.get("/access", requireAuth, ctrl.getAccess);

export default r;
