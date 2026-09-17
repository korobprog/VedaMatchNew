-- Веха 7, «Запуск»: источник входа для воронки метрик (site | web-app |
-- telegram | android). Nullable — записи до этой миграции и dev-вход по
-- паролю остаются без метки.
ALTER TABLE "LoginAudit" ADD COLUMN "client" TEXT;

-- Диапазон по дате нужен воронке входа в админке (7/30 дней по всем людям),
-- существующий индекс собран под другой запрос — "у этого userId по датам".
CREATE INDEX "LoginAudit_createdAt_idx" ON "LoginAudit"("createdAt");
