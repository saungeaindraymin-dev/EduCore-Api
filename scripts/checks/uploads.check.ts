import { existsSync } from "node:fs";
import path from "node:path";
import {
  adminToken,
  call,
  check,
  created,
  finish,
  prisma,
  signToken,
  suffix,
} from "./lib.ts";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "uploads");

const file = (name: string, text: string, type = "application/octet-stream") =>
  new File([text], name, { type });

function handIn(
  content: string,
  files: File[] = [],
  keepFileIds: string[] = [],
) {
  const form = new FormData();
  form.set("content", content);
  form.set("keepFileIds", JSON.stringify(keepFileIds));
  for (const f of files) form.append("files", f);
  return form;
}

try {
  const admin = await adminToken();

  const makeUser = async (key: string, role: string) => {
    const res = await call(
      `setup: create ${key}`,
      "POST",
      "/users",
      admin,
      {
        name: `Upload ${key}`,
        email: `upload-${key}-${suffix}@example.test`,
        password: "Passw0rd!1",
        role,
      },
      201,
    );
    created.users.push(res.body.data.id);
    return res.body.data.id as string;
  };
  const t1 = await makeUser("t1", "teacher");
  const t2 = await makeUser("t2", "teacher");
  const s1 = await makeUser("s1", "student");
  const s2 = await makeUser("s2", "student");

  const courseRes = await call(
    "setup: create course",
    "POST",
    "/courses",
    admin,
    {
      title: `Upload Course ${suffix}`,
      code: `UPL-${suffix}`,
      category: "Science",
      teacherId: t1,
    },
    201,
  );
  const courseId: string = courseRes.body.data.id;
  created.courses.push(courseId);
  await call(
    "setup: publish course",
    "PATCH",
    `/courses/${courseId}`,
    admin,
    { status: "published" },
    200,
  );
  await call(
    "setup: enroll s1",
    "POST",
    "/enrollments",
    admin,
    { studentId: s1, courseId },
    201,
  );
  await call(
    "setup: enroll s2",
    "POST",
    "/enrollments",
    admin,
    { studentId: s2, courseId },
    201,
  );

  const t1Token = signToken({ sub: t1, role: "teacher" });
  const t2Token = signToken({ sub: t2, role: "teacher" });
  const s1Token = signToken({ sub: s1, role: "student" });
  const s2Token = signToken({ sub: s2, role: "student" });

  const lesson = await call(
    "teacher adds a lesson with a video link → 201",
    "POST",
    `/courses/${courseId}/lessons`,
    t1Token,
    {
      title: "Intro",
      content: "Watch first.",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      published: true,
    },
    201,
  );
  check(
    "the video link is saved",
    lesson.body.data.videoUrl === "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  const plain = await call(
    "a lesson without a video → 201",
    "POST",
    `/courses/${courseId}/lessons`,
    t1Token,
    { title: "Reading", published: true },
    201,
  );
  check("no video means null", plain.body.data.videoUrl === null);
  await call(
    "a javascript: link is refused → 400",
    "POST",
    `/courses/${courseId}/lessons`,
    t1Token,
    { title: "Nope", videoUrl: "javascript:alert(1)" },
    400,
  );
  await call(
    "a link that isn't a URL is refused → 400",
    "POST",
    `/courses/${courseId}/lessons`,
    t1Token,
    { title: "Nope", videoUrl: "watch this video" },
    400,
  );
  const edited = await call(
    "teacher changes the link → 200",
    "PATCH",
    `/courses/${courseId}/lessons/${lesson.body.data.id}`,
    t1Token,
    { videoUrl: "https://vimeo.com/76979871" },
    200,
  );
  check(
    "the new link replaced the old",
    edited.body.data.videoUrl === "https://vimeo.com/76979871",
  );
  const cleared = await call(
    "an empty link clears it → 200",
    "PATCH",
    `/courses/${courseId}/lessons/${plain.body.data.id}`,
    t1Token,
    { videoUrl: "" },
    200,
  );
  check("clearing leaves null", cleared.body.data.videoUrl === null);
  const studentLessons = await call(
    "student reads the lessons → 200",
    "GET",
    `/courses/${courseId}/lessons`,
    s1Token,
    undefined,
    200,
  );
  check(
    "the student gets the video link",
    studentLessons.body.data.some(
      (l: { videoUrl: string | null }) =>
        l.videoUrl === "https://vimeo.com/76979871",
    ),
  );

  const work = await call(
    "setup: published assignment",
    "POST",
    `/courses/${courseId}/assignments`,
    t1Token,
    { title: `Report ${suffix}`, status: "published", totalPoints: 20 },
    201,
  );
  const workId: string = work.body.data.id;

  const first = await call(
    "student hands in text and a PDF → 201",
    "POST",
    `/assignments/${workId}/submissions`,
    s1Token,
    handIn("See the attached report.", [
      file("report.pdf", "%PDF-1.4 pretend report", "application/pdf"),
    ]),
    201,
  );
  const pdf = first.body.data.files?.[0];
  check(
    "the file is listed with its name, type and size",
    pdf?.fileName === "report.pdf" &&
      pdf?.mimeType === "application/pdf" &&
      pdf?.size === "%PDF-1.4 pretend report".length,
  );
  check(
    "where it's stored is never sent to the browser",
    pdf && pdf.storageKey === undefined,
  );

  const onlyFile = await call(
    "student hands in a file with no text → 201",
    "POST",
    `/assignments/${workId}/submissions`,
    s2Token,
    handIn("", [file("Résumé notes.docx", "pretend word doc")]),
    201,
  );
  check(
    "a file on its own is enough",
    onlyFile.body.data.content === "" && onlyFile.body.data.files.length === 1,
  );
  check(
    "a non-ASCII name survives",
    onlyFile.body.data.files[0].fileName === "Résumé notes.docx",
  );

  await call(
    "nothing at all → 400",
    "POST",
    `/assignments/${workId}/submissions`,
    s2Token,
    handIn(""),
    400,
  );
  await call(
    "a .exe → 400",
    "POST",
    `/assignments/${workId}/submissions`,
    s2Token,
    handIn("x", [file("setup.exe", "MZ")]),
    400,
  );
  await call(
    "an .html page → 400",
    "POST",
    `/assignments/${workId}/submissions`,
    s2Token,
    handIn("x", [file("page.html", "<script>")]),
    400,
  );
  await call(
    "a file over 10 MB → 413",
    "POST",
    `/assignments/${workId}/submissions`,
    s2Token,
    handIn("x", [file("huge.pdf", "x".repeat(10 * 1024 * 1024 + 1))]),
    413,
  );
  await call(
    "six files → 400",
    "POST",
    `/assignments/${workId}/submissions`,
    s2Token,
    handIn(
      "x",
      Array.from({ length: 6 }, (_, i) => file(`part${i}.txt`, "x")),
    ),
    400,
  );
  await call(
    "keeping another student's file → 400",
    "POST",
    `/assignments/${workId}/submissions`,
    s2Token,
    handIn("x", [], [pdf.id]),
    400,
  );
  await call(
    "a teacher can't hand in → 403",
    "POST",
    `/assignments/${workId}/submissions`,
    t1Token,
    handIn("x", [file("a.pdf", "x")]),
    403,
  );

  // ---- downloading ----
  const asStudent = await call(
    "the student downloads their own file → 200",
    "GET",
    `/submissions/${first.body.data.id}/files/${pdf.id}`,
    s1Token,
    undefined,
    200,
    { binary: true },
  );
  check(
    "the bytes are exactly what was uploaded",
    new TextDecoder().decode(asStudent.raw) === "%PDF-1.4 pretend report",
  );
  check(
    "it's served as a download with its name",
    (asStudent.headers.get("content-disposition") ?? "").startsWith(
      "attachment;",
    ) &&
      (asStudent.headers.get("content-disposition") ?? "").includes(
        'filename="report.pdf"',
      ),
  );
  check(
    "with the type we recorded, not the browser's",
    asStudent.headers.get("content-type")?.startsWith("application/pdf") ===
      true,
  );
  await call(
    "the course's teacher downloads it → 200",
    "GET",
    `/submissions/${first.body.data.id}/files/${pdf.id}`,
    t1Token,
    undefined,
    200,
    { binary: true },
  );
  await call(
    "an admin downloads it → 200",
    "GET",
    `/submissions/${first.body.data.id}/files/${pdf.id}`,
    admin,
    undefined,
    200,
    { binary: true },
  );
  await call(
    "another student can't → 404",
    "GET",
    `/submissions/${first.body.data.id}/files/${pdf.id}`,
    s2Token,
    undefined,
    404,
  );
  await call(
    "another teacher can't → 404",
    "GET",
    `/submissions/${first.body.data.id}/files/${pdf.id}`,
    t2Token,
    undefined,
    404,
  );
  await call(
    "a file id from another submission → 404",
    "GET",
    `/submissions/${first.body.data.id}/files/${onlyFile.body.data.files[0].id}`,
    t1Token,
    undefined,
    404,
  );
  const utf8 = await call(
    "the non-ASCII name downloads → 200",
    "GET",
    `/submissions/${onlyFile.body.data.id}/files/${onlyFile.body.data.files[0].id}`,
    t1Token,
    undefined,
    200,
    { binary: true },
  );
  check(
    "its UTF-8 name is sent too",
    (utf8.headers.get("content-disposition") ?? "").includes(
      "filename*=UTF-8''R%C3%A9sum%C3%A9%20notes.docx",
    ),
  );

  // ---- replacing files ----
  const pdfKey = (await prisma.submissionFile.findUnique({
    where: { id: pdf.id },
    select: { storageKey: true },
  }))!.storageKey;
  check("the PDF is on disk", existsSync(path.join(UPLOAD_DIR, pdfKey)));
  const kept = await call(
    "student keeps the PDF and adds a sheet → 201",
    "POST",
    `/assignments/${workId}/submissions`,
    s1Token,
    handIn(
      "Now with the data.",
      [file("data.xlsx", "pretend sheet")],
      [pdf.id],
    ),
    201,
  );
  check(
    "both files are on the submission",
    kept.body.data.files
      .map((f: { fileName: string }) => f.fileName)
      .sort()
      .join() === "data.xlsx,report.pdf",
  );
  const dropped = await call(
    "student hands in again without the PDF → 201",
    "POST",
    `/assignments/${workId}/submissions`,
    s1Token,
    handIn(
      "Final version.",
      [],
      [
        kept.body.data.files.find(
          (f: { fileName: string }) => f.fileName === "data.xlsx",
        ).id,
      ],
    ),
    201,
  );
  check(
    "only the sheet is left",
    dropped.body.data.files.length === 1 &&
      dropped.body.data.files[0].fileName === "data.xlsx",
  );
  check(
    "the dropped PDF left storage",
    !existsSync(path.join(UPLOAD_DIR, pdfKey)),
  );
  await call(
    "the dropped PDF can't be downloaded → 404",
    "GET",
    `/submissions/${first.body.data.id}/files/${pdf.id}`,
    t1Token,
    undefined,
    404,
  );

  const classWork = await call(
    "teacher reads the class's work → 200",
    "GET",
    `/assignments/${workId}/submissions`,
    t1Token,
    undefined,
    200,
  );
  check(
    "each submission lists its files",
    classWork.body.data.every(
      (s: { files: unknown[] }) =>
        Array.isArray(s.files) && s.files.length === 1,
    ),
  );

  // ---- marked work stays put ----
  await call(
    "teacher marks it → 200",
    "PATCH",
    `/submissions/${dropped.body.data.id}/grade`,
    t1Token,
    { score: 18 },
    200,
  );
  await call(
    "student changes marked work → 409",
    "POST",
    `/assignments/${workId}/submissions`,
    s1Token,
    handIn("Sneaky.", [file("new.pdf", "x")]),
    409,
  );

  const keys = (
    await prisma.submissionFile.findMany({
      where: { submission: { assignmentId: workId } },
      select: { storageKey: true },
    })
  ).map((row) => row.storageKey);
  check(
    "the remaining files are on disk",
    keys.length === 2 &&
      keys.every((key) => existsSync(path.join(UPLOAD_DIR, key))),
  );
  await call(
    "teacher deletes the assignment → 204",
    "DELETE",
    `/assignments/${workId}`,
    t1Token,
    undefined,
    204,
  );
  check(
    "its files left storage",
    keys.every((key) => !existsSync(path.join(UPLOAD_DIR, key))),
  );

  const work2 = await call(
    "setup: second assignment",
    "POST",
    `/courses/${courseId}/assignments`,
    t1Token,
    { title: `Second ${suffix}`, status: "published" },
    201,
  );
  const second = await call(
    "student hands in to it → 201",
    "POST",
    `/assignments/${work2.body.data.id}/submissions`,
    s1Token,
    handIn("", [file("notes.txt", "notes")]),
    201,
  );
  const key2 = (await prisma.submissionFile.findUnique({
    where: { id: second.body.data.files[0].id },
    select: { storageKey: true },
  }))!.storageKey;
  await call(
    "admin deletes the course → 204",
    "DELETE",
    `/courses/${courseId}`,
    admin,
    undefined,
    204,
  );
  created.courses.splice(created.courses.indexOf(courseId), 1);
  check("its files left storage too", !existsSync(path.join(UPLOAD_DIR, key2)));
} catch (e) {
  await finish(e);
}
await finish();
