-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'inactive', 'pending');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "status" "user_status" NOT NULL DEFAULT 'active';
