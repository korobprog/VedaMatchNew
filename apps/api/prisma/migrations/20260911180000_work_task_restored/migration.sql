-- VED-61: из архива доски карточку можно вернуть. Возврат — такое же событие
-- в истории задачи, как и уход в архив.
ALTER TYPE "WorkActivityKind" ADD VALUE IF NOT EXISTS 'task_restored';
