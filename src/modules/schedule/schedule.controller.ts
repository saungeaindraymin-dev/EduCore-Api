import type { Request, Response, NextFunction } from "express";
import * as service from "./schedule.service";
import { listScheduleQuery } from "./schedule.schema";

type IdParams = { id: string };

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const parsed = listScheduleQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "ValidationError",
      issues: parsed.error.issues,
    });
  }
  try {
    res.json(await service.listSchedule(parsed.data, req.user!));
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
    res.json({ data: await service.getScheduleEvent(req.params.id, req.user!) });
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
    // An array: more than one class when repeating weekly
    res.status(201).json({ data: await service.createScheduleEvents(req.body) });
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
    const event = await service.updateScheduleEvent(req.params.id, req.body);
    res.json({ data: event });
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
    await service.deleteScheduleEvent(req.params.id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
};
