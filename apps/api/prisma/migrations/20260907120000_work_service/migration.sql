-- CreateEnum
CREATE TYPE "public"."WorkMemberRole" AS ENUM ('owner', 'admin', 'member', 'viewer');

-- CreateEnum
CREATE TYPE "public"."WorkTaskPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "public"."WorkActivityKind" AS ENUM ('task_created', 'task_moved', 'task_assigned', 'task_due_set', 'task_completed', 'task_archived', 'comment_added', 'member_joined');

-- CreateTable
CREATE TABLE "public"."WorkSpace" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'magenta',
    "taskSeq" INTEGER NOT NULL DEFAULT 0,
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "WorkSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkSpaceMember" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."WorkMemberRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkSpaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkInvite" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" "public"."WorkMemberRole" NOT NULL DEFAULT 'member',
    "createdById" TEXT,
    "inviteeId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 0,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkBoard" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "WorkBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkColumn" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wipLimit" INTEGER NOT NULL DEFAULT 0,
    "isDone" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkTask" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priority" "public"."WorkTaskPriority" NOT NULL DEFAULT 'normal',
    "dueAt" TIMESTAMP(3),
    "assigneeId" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkLabel" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'cyan',

    CONSTRAINT "WorkLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkTaskLabel" (
    "taskId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "WorkTaskLabel_pkey" PRIMARY KEY ("taskId","labelId")
);

-- CreateTable
CREATE TABLE "public"."WorkChecklistItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "WorkChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "WorkComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "uploaderId" TEXT,
    "storageKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkActivity" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "taskId" TEXT,
    "actorId" TEXT,
    "kind" "public"."WorkActivityKind" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkSpace_ownerId_archivedAt_idx" ON "public"."WorkSpace"("ownerId", "archivedAt");

-- CreateIndex
CREATE INDEX "WorkSpaceMember_userId_idx" ON "public"."WorkSpaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSpaceMember_spaceId_userId_key" ON "public"."WorkSpaceMember"("spaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkInvite_tokenHash_key" ON "public"."WorkInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkInvite_spaceId_revokedAt_idx" ON "public"."WorkInvite"("spaceId", "revokedAt");

-- CreateIndex
CREATE INDEX "WorkInvite_inviteeId_idx" ON "public"."WorkInvite"("inviteeId");

-- CreateIndex
CREATE INDEX "WorkBoard_spaceId_position_idx" ON "public"."WorkBoard"("spaceId", "position");

-- CreateIndex
CREATE INDEX "WorkColumn_boardId_position_idx" ON "public"."WorkColumn"("boardId", "position");

-- CreateIndex
CREATE INDEX "WorkTask_columnId_position_idx" ON "public"."WorkTask"("columnId", "position");

-- CreateIndex
CREATE INDEX "WorkTask_boardId_archivedAt_idx" ON "public"."WorkTask"("boardId", "archivedAt");

-- CreateIndex
CREATE INDEX "WorkTask_assigneeId_dueAt_idx" ON "public"."WorkTask"("assigneeId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTask_spaceId_number_key" ON "public"."WorkTask"("spaceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "WorkLabel_spaceId_name_key" ON "public"."WorkLabel"("spaceId", "name");

-- CreateIndex
CREATE INDEX "WorkTaskLabel_labelId_idx" ON "public"."WorkTaskLabel"("labelId");

-- CreateIndex
CREATE INDEX "WorkChecklistItem_taskId_position_idx" ON "public"."WorkChecklistItem"("taskId", "position");

-- CreateIndex
CREATE INDEX "WorkComment_taskId_createdAt_idx" ON "public"."WorkComment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkAttachment_taskId_createdAt_idx" ON "public"."WorkAttachment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkActivity_taskId_createdAt_idx" ON "public"."WorkActivity"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkActivity_spaceId_createdAt_idx" ON "public"."WorkActivity"("spaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."WorkSpace" ADD CONSTRAINT "WorkSpace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkSpaceMember" ADD CONSTRAINT "WorkSpaceMember_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."WorkSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkSpaceMember" ADD CONSTRAINT "WorkSpaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkInvite" ADD CONSTRAINT "WorkInvite_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."WorkSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkInvite" ADD CONSTRAINT "WorkInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkInvite" ADD CONSTRAINT "WorkInvite_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkBoard" ADD CONSTRAINT "WorkBoard_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."WorkSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkColumn" ADD CONSTRAINT "WorkColumn_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTask" ADD CONSTRAINT "WorkTask_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."WorkSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTask" ADD CONSTRAINT "WorkTask_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTask" ADD CONSTRAINT "WorkTask_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "public"."WorkColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTask" ADD CONSTRAINT "WorkTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTask" ADD CONSTRAINT "WorkTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkLabel" ADD CONSTRAINT "WorkLabel_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."WorkSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTaskLabel" ADD CONSTRAINT "WorkTaskLabel_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTaskLabel" ADD CONSTRAINT "WorkTaskLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "public"."WorkLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkChecklistItem" ADD CONSTRAINT "WorkChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkComment" ADD CONSTRAINT "WorkComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkComment" ADD CONSTRAINT "WorkComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkAttachment" ADD CONSTRAINT "WorkAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkAttachment" ADD CONSTRAINT "WorkAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkActivity" ADD CONSTRAINT "WorkActivity_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."WorkSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkActivity" ADD CONSTRAINT "WorkActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkActivity" ADD CONSTRAINT "WorkActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
