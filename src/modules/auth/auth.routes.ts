import { Router } from "express";
import * as ctrl from "./auth.controller";
import { validate } from "@/middleware/validate";
import { requireAuth } from "@/middleware/auth";
import {
  signupSchema,
  loginSchema,
  forgotSchema,
  verifyOtpSchema,
  resetSchema,
} from "./auth.schema";

const r = Router();

r.post("/signup", validate(signupSchema), ctrl.signup);
r.post("/login", validate(loginSchema), ctrl.login);
r.post("/forgot-password", validate(forgotSchema), ctrl.forgot);
r.post("/verify-otp", validate(verifyOtpSchema), ctrl.verify);
r.post("/reset-password", validate(resetSchema), ctrl.reset);
r.get("/me", requireAuth, ctrl.me);

export default r;
