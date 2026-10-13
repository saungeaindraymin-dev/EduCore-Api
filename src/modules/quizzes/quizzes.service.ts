import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/db';
import type { JwtPayload } from '@/utils/jwt';
import { httpError } from '@/utils/errors';
import type {
  CreateQuizInput,
  ListQuizzesQuery,
  QuestionInput,
  SubmitAttemptInput,
  UpdateQuizInput,
} from './quizzes.schema';

const quizInclude = {
  course: { select: { id: true, title: true, code: true, teacherId: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { questions: true, attempts: true } },
} satisfies Prisma.QuizInclude;

type QuizWithRelations = Prisma.QuizGetPayload<{ include: typeof quizInclude }>;

// Same shape as the rest of the app: admins oversee everything, teachers see the quizzes of
// courses they teach, students only published ones in courses they're actively enrolled in.
function scopeFor(actor: JwtPayload): Prisma.QuizWhereInput {
  if (actor.role === 'teacher') return { course: { teacherId: actor.sub } };
  if (actor.role === 'student') {
    return {
      status: { in: ['published', 'closed'] },
      course: { enrollments: { some: { studentId: actor.sub, status: 'active' } } },
    };
  }
  return {};
}

/** For a student, their own attempts on a quiz — never anyone else's. */
const ownAttempts = (actor: JwtPayload) =>
  actor.role === 'student'
    ? {
        attempts: {
          where: { studentId: actor.sub },
          select: { id: true, score: true, maxScore: true, submittedAt: true },
          orderBy: { submittedAt: 'desc' as const },
        },
      }
    : {};

export async function listQuizzes(
  { q, courseId, teacherId, status, page, pageSize }: ListQuizzesQuery,
  actor: JwtPayload,
) {
  const filters: Prisma.QuizWhereInput = {};
  if (courseId) filters.courseId = courseId;
  if (teacherId) filters.course = { teacherId };
  if (status) filters.status = status;
  if (q) {
    filters.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { course: { title: { contains: q, mode: 'insensitive' } } },
      { course: { code: { contains: q, mode: 'insensitive' } } },
    ];
  }
  const where: Prisma.QuizWhereInput = { AND: [scopeFor(actor), filters] };

  const [rows, total] = await Promise.all([
    prisma.quiz.findMany({
      where,
      include: { ...quizInclude, ...ownAttempts(actor) },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.quiz.count({ where }),
  ]);

  return {
    data: rows.map((row) => toQuizDto(row, actor)),
    meta: { page, pageSize, total },
  };
}

/** The quiz with its questions. Students never receive `isCorrect` — that's the marking key. */
export async function getQuiz(id: string, actor: JwtPayload) {
  const quiz = await prisma.quiz.findFirst({
    where: { AND: [{ id }, scopeFor(actor)] },
    include: {
      ...quizInclude,
      ...ownAttempts(actor),
      questions: {
        orderBy: { position: 'asc' },
        include: { options: { orderBy: { position: 'asc' } } },
      },
    },
  });
  if (!quiz) throw httpError(404, 'Quiz not found');

  const hideKey = actor.role === 'student';
  return {
    ...toQuizDto(quiz, actor),
    questions: quiz.questions.map((question) => ({
      id: question.id,
      type: question.type,
      text: question.text,
      points: question.points,
      position: question.position,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
        position: option.position,
        ...(hideKey ? {} : { isCorrect: option.isCorrect }),
      })),
    })),
  };
}

export async function createQuiz(courseId: string, input: CreateQuizInput, actor: JwtPayload) {
  await assertTeachesCourse(courseId, actor);

  const quiz = await prisma.quiz.create({
    data: {
      courseId,
      title: input.title,
      description: input.description,
      status: input.status,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      timeLimitMinutes: input.timeLimitMinutes ?? null,
      attemptsAllowed: input.attemptsAllowed,
      createdById: actor.sub,
    },
    include: quizInclude,
  });
  return toQuizDto(quiz);
}

export async function updateQuiz(id: string, input: UpdateQuizInput, actor: JwtPayload) {
  const existing = await loadForWrite(id, actor);

  // Admins oversee: status only. The questions and the marking key belong to the teacher.
  if (actor.role === 'admin' && Object.keys(input).some((field) => field !== 'status')) {
    throw httpError(
      403,
      "Only the course's teacher can edit a quiz — an admin can change its status",
    );
  }
  // Publishing an empty quiz would give every student full marks for nothing
  if (input.status === 'published' && existing.questionCount === 0) {
    throw httpError(400, 'Add at least one question before publishing this quiz');
  }

  const { dueAt, timeLimitMinutes, ...rest } = input;
  const quiz = await prisma.quiz.update({
    where: { id },
    data: {
      ...rest,
      ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
      ...(timeLimitMinutes !== undefined && { timeLimitMinutes }),
    },
    include: quizInclude,
  });
  return toQuizDto(quiz);
}

export async function deleteQuiz(id: string, actor: JwtPayload) {
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    select: { course: { select: { teacherId: true } } },
  });
  if (!quiz) throw httpError(404, 'Quiz not found');
  // Admins may remove anything (moderation); teachers only their own courses' quizzes
  if (actor.role !== 'admin' && quiz.course.teacherId !== actor.sub) {
    throw httpError(403, 'You can only delete quizzes in your own courses');
  }
  await prisma.quiz.delete({ where: { id } });
}

// ---- questions (the teacher's marking key) ----

export async function addQuestion(quizId: string, input: QuestionInput, actor: JwtPayload) {
  await loadForWrite(quizId, actor, { teacherOnly: true });

  const last = await prisma.quizQuestion.findFirst({
    where: { quizId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const question = await prisma.quizQuestion.create({
    data: {
      quizId,
      type: input.type,
      text: input.text,
      points: input.points,
      position: (last?.position ?? 0) + 1,
      options: {
        create: input.options.map((option, index) => ({
          text: option.text,
          isCorrect: option.isCorrect,
          position: index + 1,
        })),
      },
    },
    include: { options: { orderBy: { position: 'asc' } } },
  });
  return toQuestionDto(question);
}

/** Replaces the question and its options wholesale — the options are the marking key. */
export async function updateQuestion(
  quizId: string,
  questionId: string,
  input: QuestionInput,
  actor: JwtPayload,
) {
  await loadForWrite(quizId, actor, { teacherOnly: true });
  const existing = await prisma.quizQuestion.findFirst({
    where: { id: questionId, quizId },
    select: { id: true },
  });
  if (!existing) throw httpError(404, 'Question not found');

  await prisma.quizOption.deleteMany({ where: { questionId } });
  const question = await prisma.quizQuestion.update({
    where: { id: questionId },
    data: {
      type: input.type,
      text: input.text,
      points: input.points,
      options: {
        create: input.options.map((option, index) => ({
          text: option.text,
          isCorrect: option.isCorrect,
          position: index + 1,
        })),
      },
    },
    include: { options: { orderBy: { position: 'asc' } } },
  });
  return toQuestionDto(question);
}

export async function deleteQuestion(quizId: string, questionId: string, actor: JwtPayload) {
  await loadForWrite(quizId, actor, { teacherOnly: true });
  const { count } = await prisma.quizQuestion.deleteMany({ where: { id: questionId, quizId } });
  if (count === 0) throw httpError(404, 'Question not found');
}

export async function reorderQuestions(quizId: string, questionIds: string[], actor: JwtPayload) {
  await loadForWrite(quizId, actor, { teacherOnly: true });

  const current = await prisma.quizQuestion.findMany({
    where: { quizId },
    select: { id: true },
  });
  const sent = new Set(questionIds);
  if (sent.size !== questionIds.length || sent.size !== current.length || !current.every((q) => sent.has(q.id))) {
    throw httpError(400, 'Send every question in this quiz exactly once, in the new order');
  }

  // One statement: a transaction here would risk Neon's 5s batch timeout
  const rows = Prisma.join(
    questionIds.map((id, index) => Prisma.sql`(${id}::uuid, ${index + 1}::int)`),
  );
  await prisma.$executeRaw`
    UPDATE quiz_questions AS q SET position = v.position
    FROM (VALUES ${rows}) AS v(id, position)
    WHERE q.id = v.id AND q.quiz_id = ${quizId}::uuid`;

  return getQuiz(quizId, actor);
}

// ---- attempts: this is the auto-marking ----

export async function submitAttempt(
  quizId: string,
  input: SubmitAttemptInput,
  actor: JwtPayload,
) {
  if (actor.role !== 'student') {
    throw httpError(403, 'Only students sit quizzes');
  }
  const quiz = await prisma.quiz.findFirst({
    where: { AND: [{ id: quizId }, scopeFor(actor)] },
    include: {
      questions: { orderBy: { position: 'asc' }, include: { options: true } },
    },
  });
  if (!quiz) throw httpError(404, 'Quiz not found');
  if (quiz.status !== 'published') throw httpError(400, 'This quiz is closed');
  if (quiz.questions.length === 0) throw httpError(400, 'This quiz has no questions yet');
  if (quiz.dueAt && quiz.dueAt < new Date()) throw httpError(400, 'The deadline for this quiz has passed');

  const used = await prisma.quizAttempt.count({ where: { quizId, studentId: actor.sub } });
  if (used >= quiz.attemptsAllowed) {
    throw httpError(409, `You've used all ${quiz.attemptsAllowed} attempt(s) for this quiz`);
  }

  // Every answer has to belong to this quiz — no smuggling in another quiz's options
  const questionsById = new Map(quiz.questions.map((question) => [question.id, question]));
  for (const answer of input.answers) {
    const question = questionsById.get(answer.questionId);
    if (!question) throw httpError(400, 'That answer is for a question in another quiz');
    const optionIds = new Set(question.options.map((option) => option.id));
    if (answer.optionIds.some((id) => !optionIds.has(id))) {
      throw httpError(400, 'That answer picks an option from another question');
    }
  }

  const marked = markAttempt(quiz.questions, input.answers);
  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId,
      studentId: actor.sub,
      score: marked.score,
      maxScore: marked.maxScore,
      answers: marked.breakdown,
    },
  });

  return {
    id: attempt.id,
    quizId,
    score: marked.score,
    maxScore: marked.maxScore,
    percentage: marked.percentage,
    submittedAt: attempt.submittedAt,
    attemptsUsed: used + 1,
    attemptsAllowed: quiz.attemptsAllowed,
    questions: marked.breakdown,
  };
}

type MarkableQuestion = {
  id: string;
  type: 'single' | 'multiple' | 'true_false';
  points: number;
  options: { id: string; isCorrect: boolean }[];
};

/**
 * The marking itself. A question is right when the chosen options are exactly the correct
 * ones — so a multi-answer question is all-or-nothing, and a blank answer scores zero.
 */
export function markAttempt(
  questions: MarkableQuestion[],
  answers: { questionId: string; optionIds: string[] }[],
) {
  const chosenBy = new Map(answers.map((answer) => [answer.questionId, new Set(answer.optionIds)]));

  let score = 0;
  let maxScore = 0;
  const breakdown = questions.map((question) => {
    maxScore += question.points;
    const chosen = chosenBy.get(question.id) ?? new Set<string>();
    const correctIds = question.options.filter((option) => option.isCorrect).map((o) => o.id);
    const isCorrect =
      chosen.size === correctIds.length && correctIds.every((id) => chosen.has(id));
    const awarded = isCorrect ? question.points : 0;
    score += awarded;
    return {
      questionId: question.id,
      chosenOptionIds: [...chosen],
      correctOptionIds: correctIds,
      isCorrect,
      points: question.points,
      awarded,
    };
  });

  return {
    score,
    maxScore,
    percentage: maxScore === 0 ? 0 : Math.round((score / maxScore) * 100),
    breakdown,
  };
}

/** Teachers and admins see every attempt; a student sees only their own. */
export async function listAttempts(quizId: string, actor: JwtPayload) {
  const quiz = await prisma.quiz.findFirst({
    where: { AND: [{ id: quizId }, scopeFor(actor)] },
    select: { id: true, title: true, attemptsAllowed: true },
  });
  if (!quiz) throw httpError(404, 'Quiz not found');

  const rows = await prisma.quizAttempt.findMany({
    where: { quizId, ...(actor.role === 'student' ? { studentId: actor.sub } : {}) },
    include: { student: { select: { id: true, name: true, email: true } } },
    orderBy: { submittedAt: 'desc' },
    take: 500,
  });

  const data = rows.map((attempt) => ({
    id: attempt.id,
    student: attempt.student,
    score: attempt.score,
    maxScore: attempt.maxScore,
    percentage: attempt.maxScore === 0 ? 0 : Math.round((attempt.score / attempt.maxScore) * 100),
    submittedAt: attempt.submittedAt,
    answers: attempt.answers,
  }));

  // Class summary the teacher sees above the list
  const best = new Map<string, number>();
  for (const attempt of data) {
    const current = best.get(attempt.student.id);
    if (current === undefined || attempt.percentage > current) {
      best.set(attempt.student.id, attempt.percentage);
    }
  }
  const scores = [...best.values()];
  const average = scores.length
    ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
    : null;

  return {
    data,
    meta: {
      attempts: data.length,
      students: best.size,
      averagePercentage: average,
      passRate: scores.length
        ? Math.round((scores.filter((value) => value >= 50).length / scores.length) * 100)
        : null,
    },
  };
}

// ---- helpers ----

async function loadForWrite(
  id: string,
  actor: JwtPayload,
  { teacherOnly = false } = {},
) {
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    select: {
      id: true,
      course: { select: { teacherId: true } },
      _count: { select: { questions: true } },
    },
  });
  if (!quiz) throw httpError(404, 'Quiz not found');

  const ownsIt = quiz.course.teacherId === actor.sub;
  if (teacherOnly) {
    if (!ownsIt) throw httpError(403, 'Only the teacher who runs the course writes its quizzes');
  } else if (actor.role !== 'admin' && !ownsIt) {
    throw httpError(403, 'You can only edit quizzes in your own courses');
  }
  return { questionCount: quiz._count.questions };
}

async function assertTeachesCourse(courseId: string, actor: JwtPayload) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true, teacherId: true },
  });
  if (!course) throw httpError(404, 'Course not found');
  if (actor.role !== 'teacher' || course.teacherId !== actor.sub) {
    throw httpError(403, 'Quizzes are set by the teacher who runs the course');
  }
  if (course.status === 'inactive') {
    throw httpError(400, "Can't set quizzes for an inactive course");
  }
}

function toQuestionDto(question: {
  id: string;
  type: string;
  text: string;
  points: number;
  position: number;
  options: { id: string; text: string; isCorrect: boolean; position: number }[];
}) {
  return {
    id: question.id,
    type: question.type,
    text: question.text,
    points: question.points,
    position: question.position,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      isCorrect: option.isCorrect,
      position: option.position,
    })),
  };
}

type OwnAttempt = { id: string; score: number; maxScore: number; submittedAt: Date };

export function toQuizDto(
  quiz: QuizWithRelations & { attempts?: OwnAttempt[] },
  actor?: JwtPayload,
) {
  // A student's own history; staff get the class-wide count instead
  const own = actor?.role === 'student' ? (quiz.attempts ?? []) : null;
  const best = own?.length
    ? own.reduce((top, attempt) => (attempt.score > top.score ? attempt : top))
    : null;
  const mine = own
    ? {
        myAttempts: own.length,
        attemptsLeft: Math.max(0, quiz.attemptsAllowed - own.length),
        bestScore: best
          ? {
              score: best.score,
              maxScore: best.maxScore,
              percentage: best.maxScore === 0 ? 0 : Math.round((best.score / best.maxScore) * 100),
              submittedAt: best.submittedAt,
            }
          : null,
      }
    : {};

  return {
    ...mine,
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    status: quiz.status,
    dueAt: quiz.dueAt,
    timeLimitMinutes: quiz.timeLimitMinutes,
    attemptsAllowed: quiz.attemptsAllowed,
    questions: quiz._count.questions,
    // Students only ever see their own attempt count, never the class's
    attempts: own ? own.length : quiz._count.attempts,
    course: { id: quiz.course.id, title: quiz.course.title, code: quiz.course.code },
    createdBy: quiz.createdBy,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
  };
}
