import {
  adminToken,
  call,
  check,
  created,
  finish,
  signToken,
  suffix,
} from "./lib.ts";

type Mine = {
  id: string;
  score: number | null;
  feedback: string | null;
  gradedAt: string | null;
  gradedBy: { name: string } | null;
  student: { id: string };
  files: { id: string; fileName: string }[];
  assignment: {
    id: string;
    title: string;
    totalPoints: number;
    course: { code: string };
  };
};

function handIn(content: string, files: File[] = []) {
  const form = new FormData();
  form.set("content", content);
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
        name: `Feedback ${key}`,
        email: `feedback-${key}-${suffix}@example.test`,
        password: "Passw0rd!1",
        role,
      },
      201,
    );
    created.users.push(res.body.data.id);
    return res.body.data.id as string;
  };
  const teacher = await makeUser("t1", "teacher");
  const s1 = await makeUser("s1", "student");
  const s2 = await makeUser("s2", "student");

  const courseRes = await call(
    "setup: create course",
    "POST",
    "/courses",
    admin,
    {
      title: `Feedback Course ${suffix}`,
      code: `FBK-${suffix}`,
      category: "Science",
      teacherId: teacher,
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

  const teacherToken = signToken({ sub: teacher, role: "teacher" });
  const s1Token = signToken({ sub: s1, role: "student" });
  const s2Token = signToken({ sub: s2, role: "student" });

  const setWork = (title: string) =>
    call(
      `setup: assignment ${title}`,
      "POST",
      `/courses/${courseId}/assignments`,
      teacherToken,
      { title: `${title} ${suffix}`, status: "published", totalPoints: 20 },
      201,
    );
  const essay = (await setWork("Essay")).body.data.id as string;
  const lab = (await setWork("Lab")).body.data.id as string;
  const draft = (await setWork("Later")).body.data.id as string;

  const essayWork = await call(
    "s1 hands in the essay with a file → 201",
    "POST",
    `/assignments/${essay}/submissions`,
    s1Token,
    handIn("Essay text.", [
      new File(["%PDF essay"], "essay.pdf", { type: "application/pdf" }),
    ]),
    201,
  );
  await call(
    "s1 hands in the lab → 201",
    "POST",
    `/assignments/${lab}/submissions`,
    s1Token,
    handIn("Lab notes."),
    201,
  );
  await call(
    "s2 hands in the essay → 201",
    "POST",
    `/assignments/${essay}/submissions`,
    s2Token,
    handIn("Mine."),
    201,
  );
  await call(
    "teacher marks s1's essay → 200",
    "PATCH",
    `/submissions/${essayWork.body.data.id}/grade`,
    teacherToken,
    { score: 17, feedback: "Strong argument — tighten the conclusion." },
    200,
  );

  const all = await call(
    "s1 lists their submissions → 200",
    "GET",
    "/submissions/mine",
    s1Token,
    undefined,
    200,
  );
  const rows = all.body.data as Mine[];
  check(
    "both of s1's hand-ins, none of s2's",
    rows.length === 2 && rows.every((r) => r.student.id === s1),
  );
  check(
    "each carries its assignment and course",
    rows.every(
      (r) =>
        !!r.assignment.title &&
        r.assignment.totalPoints === 20 &&
        r.assignment.course.code === `FBK-${suffix}`,
    ),
  );

  const marked = await call(
    "s1 lists marked work → 200",
    "GET",
    "/submissions/mine?graded=true",
    s1Token,
    undefined,
    200,
  );
  const essayRow = (marked.body.data as Mine[])[0];
  check(
    "only the marked essay comes back",
    marked.body.data.length === 1 && essayRow.assignment.id === essay,
  );
  check(
    "with the score, the feedback and who marked it",
    essayRow.score === 17 &&
      essayRow.feedback === "Strong argument — tighten the conclusion." &&
      essayRow.gradedBy?.name === "Feedback t1" &&
      !!essayRow.gradedAt,
  );
  check(
    "and the files they handed in, ready to download",
    essayRow.files.length === 1 && essayRow.files[0].fileName === "essay.pdf",
  );
  await call(
    "the file downloads for them → 200",
    "GET",
    `/submissions/${essayRow.id}/files/${essayRow.files[0].id}`,
    s1Token,
    undefined,
    200,
    { binary: true },
  );

  const waiting = await call(
    "s1 lists unmarked work → 200",
    "GET",
    "/submissions/mine?graded=false",
    s1Token,
    undefined,
    200,
  );
  check(
    "only the lab is waiting",
    waiting.body.data.length === 1 &&
      waiting.body.data[0].assignment.id === lab,
  );
  check(
    "with no score yet",
    waiting.body.data[0].score === null &&
      waiting.body.data[0].feedback === null,
  );

  const labRow = rows.find((r) => r.assignment.id === lab)!;
  await call(
    "teacher marks the lab later → 200",
    "PATCH",
    `/submissions/${labRow.id}/grade`,
    teacherToken,
    { score: 12, feedback: "Show your working." },
    200,
  );
  const ordered = await call(
    "s1 lists marked work again → 200",
    "GET",
    "/submissions/mine?graded=true",
    s1Token,
    undefined,
    200,
  );
  check(
    "the most recently marked comes first",
    ordered.body.data.length === 2 &&
      ordered.body.data[0].assignment.id === lab,
  );
  const limited = await call(
    "with a limit of 1 → 200",
    "GET",
    "/submissions/mine?graded=true&limit=1",
    s1Token,
    undefined,
    200,
  );
  check("the limit is respected", limited.body.data.length === 1);

  const theirs = await call(
    "s2 lists their submissions → 200",
    "GET",
    "/submissions/mine",
    s2Token,
    undefined,
    200,
  );
  check(
    "s2 sees one unmarked hand-in",
    theirs.body.data.length === 1 && theirs.body.data[0].score === null,
  );
  check(
    "s2 never sees s1's feedback",
    !(theirs.body.data as Mine[]).some((r) => r.feedback?.includes("tighten")),
  );

  check(
    "nothing from the draft assignment",
    !rows.some((r) => r.assignment.id === draft),
  );
  await call(
    "a teacher has no submissions of their own → 403",
    "GET",
    "/submissions/mine",
    teacherToken,
    undefined,
    403,
  );
  await call(
    "an admin has none either → 403",
    "GET",
    "/submissions/mine",
    admin,
    undefined,
    403,
  );
  await call(
    "bad graded filter → 400",
    "GET",
    "/submissions/mine?graded=maybe",
    s1Token,
    undefined,
    400,
  );
  await call(
    "limit over the cap → 400",
    "GET",
    "/submissions/mine?limit=500",
    s1Token,
    undefined,
    400,
  );
  await call(
    "no token → 401",
    "GET",
    "/submissions/mine",
    undefined,
    undefined,
    401,
  );

  const enrollments = await call(
    "setup: find s2's enrollment",
    "GET",
    `/enrollments?studentId=${s2}&courseId=${courseId}`,
    admin,
    undefined,
    200,
  );
  await call(
    "setup: drop s2",
    "PATCH",
    `/enrollments/${enrollments.body.data[0].id}`,
    admin,
    { status: "dropped" },
    200,
  );
  const dropped = await call(
    "dropped student lists their submissions → 200",
    "GET",
    "/submissions/mine",
    s2Token,
    undefined,
    200,
  );
  check(
    "a dropped student no longer sees that course's work",
    dropped.body.data.length === 0,
  );
} catch (e) {
  await finish(e);
}
await finish();
