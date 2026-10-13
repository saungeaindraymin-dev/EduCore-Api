import type { Request, Response, NextFunction } from "express";
import * as service from "./lessons.service";

type CourseParams = { courseId: string };
type LessonParams = { courseId: string; lessonId: string };

export const list = async (
  req: Request<CourseParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await service.listLessons(req.params.courseId, req.user!));
  } catch (e) {
    next(e);
  }
};

export const get = async (
  req: Request<LessonParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const lesson = await service.getLesson(req.params.courseId, req.params.lessonId, req.user!);
    res.json({ data: lesson });
  } catch (e) {
    next(e);
  }
};

export const create = async (
  req: Request<CourseParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const lesson = await service.createLesson(req.params.courseId, req.body, req.user!);
    res.status(201).json({ data: lesson });
  } catch (e) {
    next(e);
  }
};

export const update = async (
  req: Request<LessonParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const lesson = await service.updateLesson(
      req.params.courseId,
      req.params.lessonId,
      req.body,
      req.user!,
    );
    res.json({ data: lesson });
  } catch (e) {
    next(e);
  }
};

export const remove = async (
  req: Request<LessonParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    await service.deleteLesson(req.params.courseId, req.params.lessonId, req.user!);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
};

export const reorder = async (
  req: Request<CourseParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await service.reorderLessons(req.params.courseId, req.body.lessonIds, req.user!));
  } catch (e) {
    next(e);
  }
};
