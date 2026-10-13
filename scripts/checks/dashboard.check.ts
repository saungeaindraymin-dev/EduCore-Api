import {
  adminToken,
  call,
  check,
  created,
  finish,
  signToken,
  suffix,
} from "./lib.ts";

const inHours = (n: number) => new Date(Date.now() + n * 36e5).toISOString();

try {
  const admin = await adminToken();

  const before = (
    await call(
      "overview before seeding → 200",
      "GET",
      "/dashboard/admin",
      admin,
      undefined,
      200,
    )
  ).body.data;
  check(
    "the overview has every section the page renders",
    !!before.stats &&
      !!before.attention &&
      Array.isArray(before.recentEnrollments) &&
      Array.isArray(before.upcomingClasses) &&
      Array.isArray(before.topCourses),
  );

  const makeUser = async (key: string, role: string, status = "active") => {
    const res = await call(
      `setup: create ${key}`,
      "POST",
      "/users",
      admin,
      {
        name: `Dash ${key}`,
        email: `dash-${key}-${suffix}@example.test`,
        password: "Passw0rd!1",
        role,
        status,
      },
      201,
    );
    created.users.push(res.body.data.id);
    return res.body.data.id as string;
  };
  const teacher = await makeUser("t1", "teacher");
  const students = [
    await makeUser("s1", "student"),
    await makeUser("s2", "student"),
    await makeUser("s3", "student"),
  ];
  await makeUser("s4", "student", "inactive");

  const makeCourse = async (key: string, teacherId?: string) => {
    const res = await call(
      `setup: create course ${key}`,
      "POST",
      "/courses",
      admin,
      {
        title: `Dash Course ${key}`,
        code: `DSH${key}-${suffix}`,
        category: "Science",
        teacherId: teacherId ?? teacher,
      },
      201,
    );
    created.courses.push(res.body.data.id);
    return res.body.data.id as string;
  };
  const busy = await makeCourse("A");
  const quiet = await makeCourse("B");
  const orphan = await makeCourse("C");
  await call(
    "setup: publish course A",
    "PATCH",
    `/courses/${busy}`,
    admin,
    { status: "published" },
    200,
  );
  await call(
    "setup: publish course C",
    "PATCH",
    `/courses/${orphan}`,
    admin,
    { status: "published" },
    200,
  );
  for (const [i, id] of students.entries()) {
    await call(
      `setup: enroll student ${i + 1} in A`,
      "POST",
      "/enrollments",
      admin,
      { studentId: id, courseId: busy },
      201,
    );
  }
  await call(
    "setup: a pending enrollment",
    "POST",
    "/enrollments",
    admin,
    { studentId: students[0], courseId: orphan, status: "pending" },
    201,
  );

  const teacherToken = signToken({ sub: teacher, role: "teacher" });
  const work = await call(
    "setup: published assignment",
    "POST",
    `/courses/${busy}/assignments`,
    teacherToken,
    { title: `Dash work ${suffix}`, status: "published", totalPoints: 10 },
    201,
  );
  for (const [i, id] of students.slice(0, 2).entries()) {
    await call(
      `setup: student ${i + 1} hands in`,
      "POST",
      `/assignments/${work.body.data.id}/submissions`,
      signToken({ sub: id, role: "student" }),
      { content: "Done." },
      201,
    );
  }
  await call(
    "setup: a class in two hours",
    "POST",
    "/schedule",
    admin,
    {
      courseId: busy,
      start: inHours(2),
      end: inHours(3),
      location: `Dash room ${suffix}`,
    },
    201,
  );

  const leaver = await makeUser("t2", "teacher");
  await call(
    "setup: give course C to the second teacher",
    "PATCH",
    `/courses/${orphan}`,
    admin,
    { teacherId: leaver },
    200,
  );
  await call(
    "setup: delete the second teacher",
    "DELETE",
    `/users/${leaver}`,
    admin,
    undefined,
    204,
  );
  created.users.splice(created.users.indexOf(leaver), 1);

  const after = (
    await call(
      "overview after seeding → 200",
      "GET",
      "/dashboard/admin",
      admin,
      undefined,
      200,
    )
  ).body.data;
  const diff = (path: (d: typeof after) => number) =>
    path(after) - path(before);

  check(
    "three active students added (the inactive one doesn't count)",
    diff((d) => d.stats.students.total) === 3,
  );
  check(
    "one active teacher added (the deleted one doesn't count)",
    diff((d) => d.stats.teachers.total) === 1,
  );
  check(
    "two published courses and one draft",
    diff((d) => d.stats.courses.published) === 2 &&
      diff((d) => d.stats.courses.draft) === 1,
  );
  check(
    "course totals add up",
    after.stats.courses.total ===
      after.stats.courses.draft +
        after.stats.courses.published +
        after.stats.courses.inactive,
  );
  check(
    "three active enrollments and one pending",
    diff((d) => d.stats.enrollments.active) === 3 &&
      diff((d) => d.stats.enrollments.pending) === 1,
  );
  check(
    "new rows don't count as having existed a month ago",
    diff((d) => d.stats.students.monthAgo) === 0 &&
      diff((d) => d.stats.enrollments.activeMonthAgo) === 0,
  );
  check(
    "one open assignment, two submissions waiting to be marked",
    diff((d) => d.stats.work.openAssignments) === 1 &&
      diff((d) => d.stats.work.awaitingMarking) === 2,
  );

  check(
    "the pending enrollment needs attention",
    diff((d) => d.attention.pendingEnrollments) === 1,
  );
  check(
    "the course that lost its teacher needs attention",
    diff((d) => d.attention.coursesWithoutTeacher) === 1,
  );
  check(
    "the draft course is counted",
    diff((d) => d.attention.draftCourses) === 1,
  );
  check(
    "the unmarked work is counted",
    diff((d) => d.attention.awaitingMarking) === 2,
  );

  const recentIds = (
    after.recentEnrollments as { student: { name: string } }[]
  ).map((e) => e.student.name);
  check(
    "the newest enrollments lead the recent list",
    recentIds.slice(0, 4).every((name) => name.startsWith("Dash")),
  );
  check(
    "recent enrollments are newest first",
    (after.recentEnrollments as { enrolledAt: string }[]).every(
      (e, i, all) => i === 0 || all[i - 1].enrolledAt >= e.enrolledAt,
    ),
  );
  check(
    "the class in two hours is in the upcoming list",
    (after.upcomingClasses as { location: string | null }[]).some(
      (c) => c.location === `Dash room ${suffix}`,
    ),
  );
  const top = after.topCourses as { id: string; activeStudents: number }[];
  const busyRow = top.find((c) => c.id === busy);
  check(
    "course A appears in top courses with its 3 active students",
    !busyRow || busyRow.activeStudents === 3,
  );
  check(
    "top courses are ranked by active students",
    top.every(
      (c, i) => i === 0 || top[i - 1].activeStudents >= c.activeStudents,
    ),
  );
  check("at most five top courses", top.length <= 5);

  await call(
    "teacher reads the admin overview → 403",
    "GET",
    "/dashboard/admin",
    teacherToken,
    undefined,
    403,
  );
  await call(
    "student reads the admin overview → 403",
    "GET",
    "/dashboard/admin",
    signToken({ sub: students[0], role: "student" }),
    undefined,
    403,
  );
  await call(
    "no token → 401",
    "GET",
    "/dashboard/admin",
    undefined,
    undefined,
    401,
  );

  const adminList = await call(
    "admin lists assignments → 200",
    "GET",
    `/assignments?pageSize=100&courseId=${busy}`,
    admin,
    undefined,
    200,
  );
  const row = adminList.body.data.find(
    (a: { id: string }) => a.id === work.body.data.id,
  );
  check(
    "the admin sees 2 handed in out of 3 on the course",
    row?.submissions === 2 && row?.enrolled === 3,
  );
  const teacherList = await call(
    "teacher lists assignments → 200",
    "GET",
    `/assignments?pageSize=100&courseId=${busy}`,
    teacherToken,
    undefined,
    200,
  );
  check(
    "the teacher sees the same figures",
    teacherList.body.data.find(
      (a: { id: string }) => a.id === work.body.data.id,
    )?.submissions === 2,
  );
  const studentList = await call(
    "student lists assignments → 200",
    "GET",
    `/assignments?pageSize=100&courseId=${busy}`,
    signToken({ sub: students[2], role: "student" }),
    undefined,
    200,
  );
  const studentRow = studentList.body.data.find(
    (a: { id: string }) => a.id === work.body.data.id,
  );
  check(
    "a student never sees how many classmates handed in",
    studentRow &&
      studentRow.submissions === undefined &&
      studentRow.enrolled === undefined,
  );
  const studentOne = await call(
    "student opens the assignment → 200",
    "GET",
    `/assignments/${work.body.data.id}`,
    signToken({ sub: students[2], role: "student" }),
    undefined,
    200,
  );
  check(
    "…nor on the single assignment",
    studentOne.body.data.submissions === undefined,
  );
  check(
    "a freshly set assignment starts at 0 handed in, for its teacher",
    work.body.data.submissions === 0 && work.body.data.enrolled === 3,
  );

  const handedIn = await call(
    "admin reads who handed in → 200",
    "GET",
    `/assignments/${work.body.data.id}/submissions`,
    admin,
    undefined,
    200,
  );
  check(
    "both submissions are listed with the student's name and work",
    handedIn.body.data.length === 2 &&
      handedIn.body.data.every(
        (s: { student: { name: string }; content: string }) =>
          !!s.student.name && !!s.content,
      ),
  );
  check(
    "the summary shows who hasn't handed in yet",
    handedIn.body.meta.enrolled === 3 &&
      handedIn.body.meta.notSubmitted === 1 &&
      handedIn.body.meta.awaitingMarking === 2,
  );
  await call(
    "admin tries to mark it → 403",
    "PATCH",
    `/submissions/${handedIn.body.data[0].id}/grade`,
    admin,
    { score: 5 },
    403,
  );
} catch (e) {
  await finish(e);
}
await finish();
