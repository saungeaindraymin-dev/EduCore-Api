import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { env } from "@/config/env";
import { notFound, errorHandler } from "@/middleware/error";
import { checkMailer } from "@/utils/mailer";
import api from "./route";

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 24) {
  console.error(
    `✖ EduCore API needs Node 24+, but this is ${process.version}. ` +
      "Run `nvm use` in educore-api, then start it again.",
  );
  process.exit(1);
}

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));


app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use("/api", api);
app.use(notFound);
app.use(errorHandler);

// Say up front whether mail can go out, and don't let production start if it can't.
try {
  await checkMailer();
} catch (e) {
  console.error(`✖ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

app.listen(env.PORT, () => {
  console.log(`🚀 EduCore API on http://localhost:${env.PORT}`);
});
