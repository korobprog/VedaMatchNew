-- Заявки кандидатов на открытые роли в команде проекта: форма на лендинге
-- /team без регистрации, админ триагирует в /admin/team-applications.

-- CreateEnum
CREATE TYPE "TeamApplicationRole" AS ENUM ('security', 'backend', 'frontend', 'devops', 'qa', 'design', 'community', 'mobile', 'other');

-- CreateEnum
CREATE TYPE "TeamApplicationStatus" AS ENUM ('submitted', 'reviewing', 'accepted', 'rejected', 'closed');

-- CreateTable
CREATE TABLE "TeamApplication" (
    "id" TEXT NOT NULL,
    "role" "TeamApplicationRole" NOT NULL,
    "roleOther" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactTelegram" TEXT,
    "message" TEXT NOT NULL,
    "portfolioUrl" TEXT,
    "userId" TEXT,
    "status" "TeamApplicationStatus" NOT NULL DEFAULT 'submitted',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamApplication_status_createdAt_idx" ON "TeamApplication"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "TeamApplication" ADD CONSTRAINT "TeamApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
