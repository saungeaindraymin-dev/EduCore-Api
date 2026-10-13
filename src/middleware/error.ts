import type { ErrorRequestHandler, RequestHandler } from "express";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found" });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  const status = err.status ?? 500;
  const expose = status < 500;
  res.status(status).json({
    error: expose ? (err.name ?? "Error") : "InternalError",
    message: expose
      ? (err.message ?? "Something went wrong")
      : "Something went wrong",
  });
};
