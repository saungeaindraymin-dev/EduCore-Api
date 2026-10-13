import type { Request, Response, NextFunction } from "express";
import * as service from "./users.service";
import { listUsersQuery } from "./users.schema";

type IdParams = { id: string };

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const parsed = listUsersQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "ValidationError",
      issues: parsed.error.issues,
    });
  }
  try {
    res.json(await service.listUsers(parsed.data));
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
    res.json({ data: await service.getUser(req.params.id) });
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
    res.status(201).json({ data: await service.createUser(req.body) });
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
    const user = await service.updateUser(req.params.id, req.body, req.user!.sub);
    res.json({ data: user });
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
    await service.deleteUser(req.params.id, req.user!.sub);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
};
