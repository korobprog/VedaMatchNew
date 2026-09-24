-- VED-320: «если графа исполнителя пустует — проверь, кто составил, и
-- пропиши». С этой миграции новая задача без исполнителя сразу получает
-- составившего (resolveWorkAssignee), а уже заведённые пустые — здесь.
-- Задачи удалённых аккаунтов (createdById = NULL) остаются как есть.
-- Повторный прогон ничего не найдёт.
UPDATE "WorkTask"
SET "assigneeId" = "createdById"
WHERE "assigneeId" IS NULL
  AND "createdById" IS NOT NULL;
