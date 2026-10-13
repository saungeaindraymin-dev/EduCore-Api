-- CreateEnum
CREATE TYPE "course_status" AS ENUM ('draft', 'published', 'inactive');

-- AlterTable
ALTER TABLE "courses" DROP COLUMN "published",
ADD COLUMN     "category" VARCHAR(60) NOT NULL,
ADD COLUMN     "status" "course_status" NOT NULL DEFAULT 'draft';

-- CreateIndex
CREATE INDEX "courses_teacher_id_idx" ON "courses"("teacher_id");

-- CreateIndex
CREATE INDEX "courses_status_idx" ON "courses"("status");
