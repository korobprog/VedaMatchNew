-- VED-365: отметка «Просмотрено» на карточке задачи — своя у каждого человека.
--
-- Аддитивная: новая таблица, существующие строки не трогаются. Пустая таблица
-- означает «никто ничего не отмечал» — у всех карточек кнопка в исходном виде.

-- CreateTable
CREATE TABLE "WorkTaskView" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTaskView_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "WorkTaskView_userId_idx" ON "WorkTaskView"("userId");

-- AddForeignKey
ALTER TABLE "WorkTaskView" ADD CONSTRAINT "WorkTaskView_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskView" ADD CONSTRAINT "WorkTaskView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
