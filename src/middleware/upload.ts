import multer from "multer";
import path from "node:path";
import type { RequestHandler } from "express";
import { httpError } from "@/utils/errors";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 5;

export const ALLOWED_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export const extensionOf = (fileName: string) =>
  path.extname(fileName).toLowerCase();

const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: "utf8",
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES, fields: 10 },
  fileFilter: (_req, file, done) => {
    if (ALLOWED_TYPES[extensionOf(file.originalname)]) return done(null, true);
    done(
      httpError(
        400,
        `"${file.originalname}" isn't a file type we accept — use PDF, Word, PowerPoint, Excel, text, CSV, ZIP or an image`,
      ),
    );
  },
}).array("files", MAX_FILES);

export const acceptSubmissionFiles: RequestHandler = (req, res, next) => {
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          httpError(
            413,
            `Each file must be ${MAX_FILE_BYTES / 1024 / 1024} MB or smaller`,
          ),
        );
      }
      if (
        err.code === "LIMIT_FILE_COUNT" ||
        err.code === "LIMIT_UNEXPECTED_FILE"
      ) {
        return next(
          httpError(
            400,
            `Attach at most ${MAX_FILES} files, in the "files" field`,
          ),
        );
      }
      return next(httpError(400, err.message));
    }
    next(err);
  });
};
