import { prisma } from "@/db";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function adminOverview() {
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
  const weekAhead = new Date(now.getTime() + 7 * DAY_MS);

  const [
    students,
    studentsMonthAgo,
    teachers,
    teachersMonthAgo,
    coursesByStatus,
    publishedMonthAgo,
    activeEnrollments,
    activeEnrollmentsMonthAgo,
    pendingEnrollments,
    coursesWithoutTeacher,
    awaitingMarking,
    openAssignments,
    publishedQuizzes,
    quizAttemptsThisMonth,
    recentEnrollments,
    upcomingClasses,
    publishedCourses,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "student", status: "active" } }),
    prisma.user.count({
      where: { role: "student", status: "active", createdAt: { lt: monthAgo } },
    }),
    prisma.user.count({ where: { role: "teacher", status: "active" } }),
    prisma.user.count({
      where: { role: "teacher", status: "active", createdAt: { lt: monthAgo } },
    }),
    prisma.course.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.course.count({
      where: { status: "published", createdAt: { lt: monthAgo } },
    }),
    prisma.enrollment.count({ where: { status: "active" } }),
    prisma.enrollment.count({
      where: { status: "active", enrolledAt: { lt: monthAgo } },
    }),
    prisma.enrollment.count({ where: { status: "pending" } }),
    prisma.course.count({
      where: { teacherId: null, status: { not: "inactive" } },
    }),
    prisma.submission.count({ where: { gradedAt: null } }),
    prisma.assignment.count({ where: { status: "published" } }),
    prisma.quiz.count({ where: { status: "published" } }),
    prisma.quizAttempt.count({ where: { submittedAt: { gte: monthAgo } } }),
    prisma.enrollment.findMany({
      orderBy: { enrolledAt: "desc" },
      take: 6,
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        student: { select: { id: true, name: true } },
        course: { select: { id: true, title: true, code: true } },
      },
    }),
    prisma.scheduleEvent.findMany({
      where: { endsAt: { gt: now }, startsAt: { lt: weekAhead } },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        location: true,
        course: { select: { id: true, title: true, code: true } },
        teacher: { select: { id: true, name: true } },
      },
    }),
    // Few enough to rank in memory: Prisma can't order by a filtered relation count
    prisma.course.findMany({
      where: { status: "published" },
      take: 200,
      select: {
        id: true,
        title: true,
        code: true,
        teacher: { select: { id: true, name: true } },
        _count: { select: { enrollments: { where: { status: "active" } } } },
      },
    }),
  ]);

  const courseCounts = { draft: 0, published: 0, inactive: 0 };
  for (const row of coursesByStatus) courseCounts[row.status] = row._count._all;

  const topCourses = publishedCourses
    .map((course) => ({
      id: course.id,
      title: course.title,
      code: course.code,
      teacher: course.teacher,
      activeStudents: course._count.enrollments,
    }))
    .sort((a, b) => b.activeStudents - a.activeStudents)
    .slice(0, 5);

  return {
    generatedAt: now,
    stats: {
      students: { total: students, monthAgo: studentsMonthAgo },
      teachers: { total: teachers, monthAgo: teachersMonthAgo },
      courses: {
        ...courseCounts,
        total:
          courseCounts.draft + courseCounts.published + courseCounts.inactive,
        publishedMonthAgo,
      },
      enrollments: {
        active: activeEnrollments,
        activeMonthAgo: activeEnrollmentsMonthAgo,
        pending: pendingEnrollments,
      },
      work: {
        openAssignments,
        awaitingMarking,
        publishedQuizzes,
        quizAttemptsThisMonth,
      },
    },
    // The things an admin can act on today
    attention: {
      pendingEnrollments,
      coursesWithoutTeacher,
      draftCourses: courseCounts.draft,
      awaitingMarking,
    },
    recentEnrollments,
    upcomingClasses: upcomingClasses.map((event) => ({
      id: event.id,
      title: event.title,
      start: event.startsAt,
      end: event.endsAt,
      location: event.location,
      course: event.course,
      teacher: event.teacher,
    })),
    topCourses,
  };
}
