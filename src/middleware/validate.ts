import type { RequestHandler } from "express";
import { z, type ZodTypeAny } from "zod";

export const idParamSchema = z.object({ id: z.uuid() });

export const validate =
  (schema: ZodTypeAny, source: "body" | "params" = "body"): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: result.error.issues,
      });
    }
    if (source === "body") req.body = result.data;
    next();
  };
