-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LearningEventType" ADD VALUE 'QUEST_COMPLETED';
ALTER TYPE "LearningEventType" ADD VALUE 'FOCUS_SESSION_COMPLETED';

-- AlterEnum
ALTER TYPE "PracticeMode" ADD VALUE 'LIGHTNING';

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "accentColor" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "transparencyEffects" BOOLEAN NOT NULL DEFAULT true;
