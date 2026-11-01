import type { Request, Response, NextFunction } from "express";
import * as service from "./auth.service";

export const signup = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.status(201).json(await service.signup(req.body));
  } catch (e) {
    next(e);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await service.login(req.body.email, req.body.password);
    res.cookie("token", result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const forgot = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // The spread is empty unless mail is going nowhere (development only) — see
    // ResetRequestResult in auth.service.ts.
    const delivery = await service.requestPasswordReset(req.body.email);
    res.json({
      ok: true,
      message: "If that email exists, a code was sent.",
      ...delivery,
    });
  } catch (e) {
    next(e);
  }
};

export const verify = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await service.verifyOtp(req.body.email, req.body.code));
  } catch (e) {
    next(e);
  }
};

export const reset = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await service.resetPassword(
      req.body.email,
      req.body.code,
      req.body.password,
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const me = async (req: Request, res: Response) => {
  res.json({ user: req.user });
};
