import type { Request, Response, NextFunction } from "express";
import * as service from "./enrollments.service";
import { listEnrollmentsQuery } from "./enrollments.schema";

type IdParams = { id: string };

export const list = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = listEnrollmentsQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "ValidationError",
      issues: parsed.error.issues,
    });
  }
  try {
    res.json(await service.listEnrollments(parsed.data, req.user!));
  } catch (e) {
    next(e);
  }
};

export const get = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json({ data: await service.getEnrollment(req.params.id, req.user!) });
  } catch (e) {
    next(e);
  }
};

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.status(201).json({ data: await service.createEnrollment(req.body) });
  } catch (e) {
    next(e);
  }
};

export const update = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const enrollment = await service.updateEnrollment(req.params.id, req.body);
    res.json({ data: enrollment });
  } catch (e) {
    next(e);
  }
};

export const remove = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    await service.deleteEnrollment(req.params.id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
};
