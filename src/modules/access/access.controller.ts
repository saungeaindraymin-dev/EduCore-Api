import type { Request, Response, NextFunction } from "express";
import * as service from "./access.service";

export const getAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json({ data: await service.getAccess(req.user!) });
  } catch (e) {
    next(e);
  }
};
