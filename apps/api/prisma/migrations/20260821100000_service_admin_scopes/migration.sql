-- Права администратора сервиса: роль service_admin получает доступ только к
-- перечисленным здесь сервисам. Роль admin эту таблицу не читает.
CREATE TABLE "ServiceAdmin" (
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceAdmin_pkey" PRIMARY KEY ("userId","serviceId")
);

CREATE INDEX "ServiceAdmin_serviceId_idx" ON "ServiceAdmin"("serviceId");

ALTER TABLE "ServiceAdmin" ADD CONSTRAINT "ServiceAdmin_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceAdmin" ADD CONSTRAINT "ServiceAdmin_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
