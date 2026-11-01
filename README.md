# EduCore API — Learning Management System (Backend)

The REST API behind EduCore, built from scratch with Express 5, Prisma 7 and Neon Postgres. It owns the whole domain — users and roles, courses and lessons, enrollments, the timetable, announcements, assignments with file hand-ins, and auto-marked quizzes — and it is the single source of truth for who may see or do what.

**Repository:** https://github.com/saungeaindraymin-dev/EduCore-Api
**Web app:** https://github.com/saungeaindraymin-dev/EduCore (Next.js 16 + Tailwind v4)
**Live demo:** not deployed yet

## Core Features

- **Permissions in one file:** `access.config.ts` holds every role's permissions and its menu. Routes declare what they need (`requirePermission("courses.manage", "courses.edit_own")`), the web app builds its sidebar from the same table through `GET /api/me/access`, so the two can never drift apart.
- **Scope that cannot be widened:** every service turns the caller into a `scopeFor(actor)` filter — a teacher's own courses, a student's enrolled ones — and ANDs it with whatever the request asked for. A filter in the query string can narrow what comes back, never broaden it.
- **Real-world role split:** admins run the institute (users, courses, enrollments, timetable, deletion) but cannot author lessons or mark work; teachers own the teaching of their own courses; students only ever reach their own enrolments, their own submissions and their own marks.
- **Auth:** sign-up and sign-in with bcrypt-hashed passwords and JWTs, plus a forgotten-password journey through a one-time code emailed over SMTP (hashed, single-use, expiring).
- **Assignments and file hand-ins:** multipart uploads through multer — up to 5 files of 10 MB each, extension allow-list (PDF, Office, images, csv, zip), non-ASCII filenames preserved. Downloads are access-controlled per file: the student who handed it in, that course's teacher, or an admin — anyone else gets a 404, never a hint that the file exists.
- **Storage with a swap seam:** `utils/storage.ts` is the only code that touches bytes (local disk in development), so moving to Cloudflare R2 means replacing four functions. Files are cleaned up when a submission is replaced, or when the assignment, course or user is deleted.
- **Quizzes marked by the server:** questions, options and the answer key live in the database; an attempt is scored on submit (multi-answer is all-or-nothing, exact-set equality), and the per-question breakdown and class stats come back with it. Clients never see the key before the answer.
- **Dashboard in one request:** `GET /api/dashboard/admin` gathers every institute figure — totals and where they stood 30 days ago, work waiting to be marked, courses without a teacher, top courses, upcoming classes — in a single `Promise.all`.
- **Validated at the edge:** Zod schemas check the params and the body before a controller runs; a bad request comes back as `{ error: "ValidationError", issues }` with the field that failed, never a stack trace.
- **Predictable responses:** `{ data }` for one thing, `{ data, meta }` for a page (`page`, `pageSize`, `total`). Every `/api` response carries `Cache-Control: no-store`, so a list is never served stale after a create or delete.
- **Checks that drive the real API:** suites in `scripts/checks/` sign their own tokens, create what they need over HTTP, assert the behaviour (including the 403s and 404s) and delete it all again, files included.

## Tech Stack

- **Runtime:** Node 24 (enforced at boot; `.nvmrc`)
- **Framework:** Express 5
- **Language:** TypeScript (ESM, path aliases, run through `tsx`)
- **Database:** Neon Postgres via Prisma 7 (`prisma-client` generator → `src/generated/prisma`, `PrismaNeon` WebSocket adapter)
- **Validation:** Zod 4 (`validate(schema, "body" | "params")`)
- **Auth:** jsonwebtoken + bcryptjs; Bearer token or `token` cookie
- **Uploads:** multer 2 (memory storage) → a storage layer with an R2 seam
- **Mail:** nodemailer over SMTP (one-time codes), with a no-provider fallback for development
- **Hardening:** helmet, cors (credentials, single origin), morgan
- **Package manager:** pnpm

## Folder Structure

```
src/
├── server.ts                           # bootstrap: Node-24 guard, helmet/cors/morgan, no-store, listen
├── route.ts                            # mounts every module under /api
├── config/env.ts                       # Zod-validated environment — the app refuses to start without it
├── db/
│   ├── index.ts                        # the Prisma client (Neon adapter)
│   └── seed.ts                         # one admin, one teacher, one student
├── middleware/
│   ├── auth.ts                         # requireAuth + requirePermission(...anyOf)
│   ├── validate.ts                     # Zod → 400 with issues
│   ├── upload.ts                       # multer: 5 files, 10 MB, extension allow-list
│   └── error.ts                        # notFound + the single error shape
├── modules/                            # one folder per resource: routes → controller → service → schema
│   ├── access/                         # access.config.ts — permissions + menu, the source of truth
│   ├── auth/                           # signup, login, forgot → OTP → reset, me
│   ├── users/  courses/  lessons/  enrollments/
│   ├── students/                       # the roster a teacher is allowed to see
│   ├── assignments/                    # assignments, submissions, marking, file downloads
│   ├── quizzes/                        # builder, attempts, automatic marking
│   ├── schedule/  announcements/
│   └── dashboard/                      # the admin overview, assembled in one round trip
├── utils/
│   ├── jwt.ts  hash.ts  otp.ts  mailer.ts
│   ├── storage.ts                      # the only code that touches file bytes (R2 seam)
│   └── errors.ts                       # httpError(status, message)
└── generated/prisma/                   # generated client — not edited by hand

prisma/
├── schema.prisma                       # User, Course, Lesson, Enrollment, ScheduleEvent,
│                                       # Announcement, Assignment, Submission, SubmissionFile,
│                                       # Quiz, QuizQuestion, QuizOption, QuizAttempt, OtpCode
└── migrations/                         # 11 migrations, 0_init onwards

scripts/checks/                         # end-to-end checks over HTTP
├── lib.ts                              # harness: call/check, token signing, teardown
├── *.check.ts                          # one suite per area
└── run-all.ts                          # every suite, one after another
```

## Setup

```bash
nvm use                 # Node 24
pnpm install
pnpm db:migrate         # apply migrations (prisma migrate deploy)
pnpm db:seed            # admin / teacher / student accounts
pnpm dev                # http://localhost:4000
pnpm checks             # end-to-end checks against the running API
```

`.env`:

```
DATABASE_URL=postgresql://…           # Neon, pooled
JWT_SECRET=…                          # 32+ characters
JWT_EXPIRES=7d
CORS_ORIGIN=http://localhost:3000
MAIL_TRANSPORT=auto                   # auto | smtp | log | ethereal — see Mail below
SMTP_HOST=…  SMTP_PORT=465  SMTP_USER=…  SMTP_PASS=…  MAIL_FROM=…
PORT=4000
UPLOAD_DIR=uploads
NODE_ENV=development
```

Copy `.env.example` to `.env` to start. The mail settings may stay empty in development.

### Mail

One-time codes go out over SMTP, with a fallback so the forgotten-password journey
works before a provider is set up. `MAIL_TRANSPORT` picks how:

| | what happens |
| --- | --- |
| `auto` (default) | `smtp` when `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` are filled in with something that isn't an obvious placeholder, `log` otherwise |
| `smtp` | real delivery; the only mode production will start in |
| `log` | nothing is emailed: the code is printed in the API log, the mail is saved to `.mail/`, and the API hands the code back to the browser so the reset screens can fill it in. **Development only** |
| `ethereal` | a throwaway inbox from nodemailer; the log prints a preview URL. No account needed, but it does need network |

The API says which mode it is in at startup, and **refuses to start in production**
unless mail is configured — a deploy without SMTP credentials fails loudly instead of
silently swallowing password resets.

With Resend: `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASS=<re_… API key>`.
Until a domain is verified there, `MAIL_FROM` must be `EduCore <onboarding@resend.dev>`,
and mail only reaches the address that owns the Resend account.

Seeded accounts: `admin@educore.app` / `Admin@123`, `teacher@educore.app` / `Teacher@123`, `student@educore.app` / `Student@123`.

## API

Everything lives under `/api`. All but `/health` and the auth routes need `Authorization: Bearer <token>`.

| Area | Endpoints | Who |
|---|---|---|
| Health | `GET /health` | anyone |
| Auth | `POST /auth/signup` `/auth/login` `/auth/forgot-password` `/auth/verify-otp` `/auth/reset-password`, `GET /auth/me` | anyone / signed in |
| Access | `GET /me/access` | signed in — permissions + the menu for the role |
| Users | `GET/POST /users`, `GET/PATCH/DELETE /users/:id` | admin |
| Courses | `GET /courses`, `GET /courses/:id` | scoped to the caller |
| | `POST /courses`, `DELETE /courses/:id` | admin only |
| | `PATCH /courses/:id` | admin, or the course's teacher |
| Lessons | `GET/POST /courses/:id/lessons`, `GET/PATCH/DELETE /courses/:id/lessons/:lessonId` | read: enrolled students; write: the course's teacher |
| Enrollments | `GET/POST /enrollments`, `PATCH/DELETE /enrollments/:id` | admin writes; teachers and students read their own |
| Students | `GET /students` | teachers (only students in their own courses) and admins |
| Assignments | `GET /assignments`, `GET /assignments/:id` | scoped to the caller |
| | `GET/POST /courses/:id/assignments`, `PATCH/DELETE /assignments/:id` | the course's teacher (admins may change status or delete) |
| | `POST /assignments/:id/submissions` | students — multipart: text + up to 5 files |
| | `GET /assignments/:id/submissions` | the course's teacher; admins read-only; a student gets only their own |
| Submissions | `GET /submissions/mine` | students — their own marks and feedback |
| | `PATCH /submissions/:id/grade` | the course's teacher only |
| | `GET /submissions/:id/files/:fileId` | the owner, the course's teacher, or an admin |
| Quizzes | `GET /quizzes`, `GET /quizzes/:id`, `GET/POST /courses/:id/quizzes`, `PATCH/DELETE /quizzes/:id` | read scoped to the caller; write: the course's teacher |
| | `POST /quizzes/:id/questions`, `PATCH/DELETE /quizzes/:id/questions/:questionId`, `PUT /quizzes/:id/questions/order` | the course's teacher |
| | `POST /quizzes/:id/attempts`, `GET /quizzes/:id/attempts` | students sit and see their own; teachers see the class |
| Schedule | `GET /schedule`, `POST/PATCH/DELETE /schedule/:id` | everyone reads their own week; admins write |
| Announcements | `GET /announcements`, `POST/PATCH/DELETE /announcements/:id` | admins post to anyone; teachers to their own courses |
| Dashboard | `GET /dashboard/admin` | admin |

Responses are `{ data }`, or `{ data, meta: { page, pageSize, total } }` for a list. Errors are `{ error, message }` — a failed validation returns `{ error: "ValidationError", issues }` — with the status that matches: `400` validation, `401` no or bad token, `403` wrong role, `404` not found or not yours, `409` conflict, `413` file too large.
