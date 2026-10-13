import type { Request, Response, NextFunction } from "express";
import * as service from "./quizzes.service";
import { listQuizzesQuery } from "./quizzes.schema";

type IdParams = { id: string };
type QuestionParams = { id: string; questionId: string };
type CourseParams = { courseId: string };

const parseQuery = (req: Request, res: Response) => {
  const parsed = listQuizzesQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", issues: parsed.error.issues });
    return null;
  }
  return parsed.data;
};

export const list = async (req: Request, res: Response, next: NextFunction) => {
  const query = parseQuery(req, res);
  if (!query) return;
  try {
    res.json(await service.listQuizzes(query, req.user!));
  } catch (e) {
    next(e);
  }
};

export const listForCourse = async (
  req: Request<CourseParams>,
  res: Response,
  next: NextFunction,
) => {
  const parsed = listQuizzesQuery.safeParse({ ...req.query, courseId: req.params.courseId });
  if (!parsed.success) {
    return res.status(400).json({ error: "ValidationError", issues: parsed.error.issues });
  }
  try {
    res.json(await service.listQuizzes(parsed.data, req.user!));
  } catch (e) {
    next(e);
  }
};

export const get = async (req: Request<IdParams>, res: Response, next: NextFunction) => {
  try {
    res.json({ data: await service.getQuiz(req.params.id, req.user!) });
  } catch (e) {
    next(e);
  }
};

export const create = async (req: Request<CourseParams>, res: Response, next: NextFunction) => {
  try {
    const quiz = await service.createQuiz(req.params.courseId, req.body, req.user!);
    res.status(201).json({ data: quiz });
  } catch (e) {
    next(e);
  }
};

export const update = async (req: Request<IdParams>, res: Response, next: NextFunction) => {
  try {
    res.json({ data: await service.updateQuiz(req.params.id, req.body, req.user!) });
  } catch (e) {
    next(e);
  }
};

export const remove = async (req: Request<IdParams>, res: Response, next: NextFunction) => {
  try {
    await service.deleteQuiz(req.params.id, req.user!);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
};

export const addQuestion = async (req: Request<IdParams>, res: Response, next: NextFunction) => {
  try {
    const question = await service.addQuestion(req.params.id, req.body, req.user!);
    res.status(201).json({ data: question });
  } catch (e) {
    next(e);
  }
};

export const updateQuestion = async (
  req: Request<QuestionParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const question = await service.updateQuestion(
      req.params.id,
      req.params.questionId,
      req.body,
      req.user!,
    );
    res.json({ data: question });
  } catch (e) {
    next(e);
  }
};

export const removeQuestion = async (
  req: Request<QuestionParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    await service.deleteQuestion(req.params.id, req.params.questionId, req.user!);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
};

export const reorderQuestions = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const quiz = await service.reorderQuestions(
      req.params.id,
      req.body.questionIds,
      req.user!,
    );
    res.json({ data: quiz });
  } catch (e) {
    next(e);
  }
};

// Marked on submission — the response carries the score and the per-question breakdown
export const submitAttempt = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const attempt = await service.submitAttempt(req.params.id, req.body, req.user!);
    res.status(201).json({ data: attempt });
  } catch (e) {
    next(e);
  }
};

export const listAttempts = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await service.listAttempts(req.params.id, req.user!));
  } catch (e) {
    next(e);
  }
};
