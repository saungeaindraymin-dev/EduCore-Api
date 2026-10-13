import type { Request, Response, NextFunction } from "express";
import * as service from "./announcements.service";
import { listAnnouncementsQuery } from "./announcements.schema";

type IdParams = { id: string };

export const list = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = listAnnouncementsQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "ValidationError",
      issues: parsed.error.issues,
    });
  }
  try {
    res.json(await service.listAnnouncements(parsed.data, req.user!));
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
    res.json({ data: await service.getAnnouncement(req.params.id, req.user!) });
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
    const announcement = await service.createAnnouncement(req.body, req.user!);
    res.status(201).json({ data: announcement });
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
    const announcement = await service.updateAnnouncement(
      req.params.id,
      req.body,
      req.user!,
    );
    res.json({ data: announcement });
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
    await service.deleteAnnouncement(req.params.id, req.user!);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
};
