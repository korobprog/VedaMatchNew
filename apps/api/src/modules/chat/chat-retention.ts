/**
 * Сколько живёт удалённое сообщение до окончательной чистки.
 *
 * Мягкое удаление оставляет место сообщения в переписке видимым, но текст,
 * вложения и файлы в S3 до сих пор лежали вечно: «удалить» означало только
 * «спрятать». Отсрочка нужна, потому что жалобу подают уже после того, как
 * написанное стёрли, и разбирают её по тому, что человек успел удалить.
 *
 * Тридцать дней — компромисс между этими двумя: жалоба живёт днями, а не
 * месяцами, и к исходу срока разбирать уже нечего. Переопределяется
 * `CHAT_DELETED_RETENTION_DAYS`, если практика модерации скажет другое.
 *
 * Вынесено отдельно от воркера, чтобы покрываться тестом без Prisma и Redis.
 */
export const DEFAULT_RETENTION_DAYS = 30;

/** Ниже суток чистка обгоняет разбор жалобы, выше года — теряет смысл. */
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;

/**
 * Срок из переменной окружения. Мусор в настройке не должен ни ронять старт,
 * ни молча включать нулевой срок: непонятное значение — это значение по
 * умолчанию, а не «стирать сразу».
 */
export function retentionDays(raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value))
    return DEFAULT_RETENTION_DAYS;
  if (value < MIN_RETENTION_DAYS || value > MAX_RETENTION_DAYS)
    return DEFAULT_RETENTION_DAYS;
  return value;
}

/** Граница: всё, что удалено раньше неё, чистится. */
export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
