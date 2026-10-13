-- CreateTable
CREATE TABLE "schedule_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "teacher_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "location" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_events_starts_at_idx" ON "schedule_events"("starts_at");

-- CreateIndex
CREATE INDEX "schedule_events_course_id_idx" ON "schedule_events"("course_id");

-- CreateIndex
CREATE INDEX "schedule_events_teacher_id_idx" ON "schedule_events"("teacher_id");

-- AddForeignKey
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
