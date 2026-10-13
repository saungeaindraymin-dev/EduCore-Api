-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('active', 'pending', 'dropped');

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "status" "enrollment_status" NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "enrollments_course_id_idx" ON "enrollments"("course_id");

-- CreateIndex
CREATE INDEX "enrollments_status_idx" ON "enrollments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_id_course_id_key" ON "enrollments"("student_id", "course_id");
