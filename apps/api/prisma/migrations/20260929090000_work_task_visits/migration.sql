-- VED-485: вид «Последние» — когда человек последний раз открывал задачу.
CREATE TABLE "WorkTaskVisit" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTaskVisit_pkey" PRIMARY KEY ("taskId","userId")
);

CREATE INDEX "WorkTaskVisit_userId_visitedAt_idx" ON "WorkTaskVisit"("userId", "visitedAt");

ALTER TABLE "WorkTaskVisit" ADD CONSTRAINT "WorkTaskVisit_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTaskVisit" ADD CONSTRAINT "WorkTaskVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
