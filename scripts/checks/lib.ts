import { rm } from "node:fs/promises";
import path from "node:path";
import { signToken } from "../../src/utils/jwt.ts";
import { prisma } from "../../src/db/index.ts";

export { prisma, signToken };

export const API = process.env.CHECK_API ?? "http://localhost:4000/api";
export const NOBODY = "00000000-0000-0000-0000-000000000000";
export const suffix = Date.now().toString().slice(-6);

export type Result = {
  status: number;
  body: any;
  headers: Headers;
  raw?: ArrayBuffer;
};

let failures = 0;

function summarize(json: unknown) {
  const text = typeof json === "string" ? json : JSON.stringify(json);
  return text && text.length > 110 ? `${text.slice(0, 110)}…` : (text ?? "");
}

export function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

export async function call(
  label: string,
  method: string,
  path: string,
  token: string | undefined,
  body: unknown,
  expected: number,
  { binary = false } = {},
): Promise<Result> {
  const isForm = body instanceof FormData;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(isForm || body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  let json: unknown = null;
  let raw: ArrayBuffer | undefined;
  if (binary && res.ok) {
    raw = await res.arrayBuffer();
  } else {
    const text = await res.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
  }
  const ok = res.status === expected;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label.padEnd(58)} ${res.status}${ok ? "" : ` (expected ${expected})`} ${
      raw ? `<${raw.byteLength} bytes>` : summarize(json)
    }`,
  );
  return { status: res.status, body: json, headers: res.headers, raw };
}

export async function adminToken() {
  const bootstrap = signToken({ sub: NOBODY, role: "admin" });
  const admins = await call(
    "setup: find an admin",
    "GET",
    "/users?role=admin&pageSize=1",
    bootstrap,
    undefined,
    200,
  );
  return signToken({ sub: admins.body.data[0].id, role: "admin" });
}

export const created = { users: [] as string[], courses: [] as string[] };

export async function finish(error?: unknown) {
  if (error) {
    failures++;
    console.log(
      "FAIL script error:",
      error instanceof Error ? error.message : String(error),
    );
  }
  try {
    const files = await prisma.submissionFile.findMany({
      where: {
        submission: {
          OR: [
            { assignment: { courseId: { in: created.courses } } },
            { studentId: { in: created.users } },
          ],
        },
      },
      select: { storageKey: true },
    });
    const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
    await Promise.all(
      files.map((f) => rm(path.join(uploadDir, f.storageKey), { force: true })),
    );
    const courses = await prisma.course.deleteMany({
      where: { id: { in: created.courses } },
    });
    const users = await prisma.user.deleteMany({
      where: { id: { in: created.users } },
    });
    console.log(
      `cleanup: deleted ${courses.count} course(s), ${users.count} user(s), ${files.length} stored file(s)`,
    );
  } catch (e) {
    failures++;
    console.log("FAIL cleanup:", e instanceof Error ? e.message : String(e));
  }
  await prisma.$disconnect();
  console.log(
    failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
