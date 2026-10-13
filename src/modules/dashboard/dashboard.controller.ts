import type { Request, Response, NextFunction } from "express";
import * as service from "./dashboard.service";

export const admin = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json({ data: await service.adminOverview() });
  } catch (e) {
    next(e);
  }
};
