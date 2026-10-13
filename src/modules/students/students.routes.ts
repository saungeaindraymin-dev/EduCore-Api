import { Router } from "express";
import * as ctrl from "./students.controller";
import { requireAuth, requirePermission } from "@/middleware/auth";

const r = Router();

r.use(requireAuth);

// Read-only roster. The service scopes rows by role: admins see every student,
// teachers only students enrolled in a course they teach.
// GET /api/students?q=&courseId=&status=&page=1&pageSize=20
r.get("/", requirePermission("users.manage", "enrollments.view_own"), ctrl.list);

export default r;
