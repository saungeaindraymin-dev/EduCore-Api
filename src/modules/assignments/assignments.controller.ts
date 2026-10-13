import type { Request, Response, NextFunction } from "express";
import * as service from "./assignments.service";
import { listAssignmentsQuery, mySubmissionsQuery } from "./assignments.schema";

type IdParams = { id: string };
type CourseParams = { courseId: string };

export const list = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = listAssignmentsQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "ValidationError",
      issues: parsed.error.issues,
    });
  }
  try {
    res.json(await service.listAssignments(parsed.data, req.user!));
  } catch (e) {
    next(e);
  }
};

export const listForCourse = async (
  req: Request<CourseParams>,
  res: Response,
  next: NextFunction,
) => {
  const parsed = listAssignmentsQuery.safeParse({
    ...req.query,
    courseId: req.params.courseId,
  });
  if (!parsed.success) {
    return res.status(400).json({
      error: "ValidationError",
      issues: parsed.error.issues,
    });
  }
  try {
    res.json(await service.listAssignments(parsed.data, req.user!));
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
    res.json({ data: await service.getAssignment(req.params.id, req.user!) });
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
    const assignment = await service.createAssignment(
      req.params.courseId,
      req.body,
      req.user!,
    );
    res.status(201).json({ data: assignment });
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
    const assignment = await service.updateAssignment(
      req.params.id,
      req.body,
      req.user!,
    );
    res.json({ data: assignment });
  } catch (e) {
    next(e);
  }
};

// A student hands work in (or replaces what they handed in)
export const submitWork = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const uploads = (req.files as Express.Multer.File[] | undefined) ?? [];
    const submission = await service.submitWork(
      req.params.id,
      req.body,
      uploads,
      req.user!,
    );
    res.status(201).json({ data: submission });
  } catch (e) {
    next(e);
  }
};

export const listSubmissions = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await service.listSubmissions(req.params.id, req.user!));
  } catch (e) {
    next(e);
  }
};

export const listMySubmissions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const parsed = mySubmissionsQuery.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "ValidationError", issues: parsed.error.issues });
  }
  try {
    res.json(await service.listMySubmissions(parsed.data, req.user!));
  } catch (e) {
    next(e);
  }
};

export const gradeSubmission = async (
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const graded = await service.gradeSubmission(
      req.params.id,
      req.body,
      req.user!,
    );
    res.json({ data: graded });
  } catch (e) {
    next(e);
  }
};

export const downloadSubmissionFile = async (
  req: Request<{ id: string; fileId: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const file = await service.getSubmissionFile(
      req.params.id,
      req.params.fileId,
      req.user!,
    );
    const asciiName = file.fileName
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_");
    res.set({
      "Content-Type": file.mimeType,
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    });
    res.send(file.bytes);
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
    await service.deleteAssignment(req.params.id, req.user!);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
};
