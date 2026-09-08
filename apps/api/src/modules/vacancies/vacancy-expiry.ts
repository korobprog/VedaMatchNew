import { VACANCY_RENEW_WINDOW_DAYS, type VacancyKind } from '@vedamatch/shared';

/**
 * Сроки жизни предложений. Чистые функции без Prisma: лента, где вакансии
 * полугодовой давности висят наравне со свежими, мертва, и правила
 * протухания должны проверяться тестами напрямую.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Сколько живёт предложение каждого вида, в днях. */
export const DEFAULT_TTL_DAYS: Record<VacancyKind, number> = {
  // Вакансию закрывают за месяц либо переписывают.
  work: 30,
  // Служение ищут дольше: спрос на руки в храме постоянен.
  seva: 45,
  // Разовая задача без даты — вопрос пары недель.
  task: 14,
};

export interface ExpiryInput {
  kind: VacancyKind;
  /** До какой даты нужно служение, если срок «до даты» или «на событие». */
  sevaUntil?: Date | null;
  /** Дедлайн разовой задачи. */
  dueAt?: Date | null;
}

/**
 * Когда предложение протухнет.
 *
 * У задачи с дедлайном и у служения с датой срок привязан к дате, а не к
 * публикации: «помочь на фестивале 20-го» бесполезно 21-го, а объявление о
 * служении на праздник через три месяца не должно исчезнуть за месяц до него.
 */
export function resolveExpiresAt(input: ExpiryInput, now: Date): Date {
  const anchored =
    input.kind === 'task'
      ? input.dueAt
      : input.kind === 'seva'
        ? input.sevaUntil
        : null;
  if (anchored) return new Date(anchored.getTime() + DAY_MS);
  return new Date(now.getTime() + DEFAULT_TTL_DAYS[input.kind] * DAY_MS);
}

/**
 * Можно ли продлить прямо сейчас. Раньше окна продлевать нечего — это
 * превратилось бы в кнопку «поднять в топ», нажимаемую каждый день.
 */
export function canRenew(
  expiresAt: Date,
  now: Date,
  input: Pick<ExpiryInput, 'kind' | 'dueAt' | 'sevaUntil'>,
): boolean {
  // Прошедшую дату не продлевают: у неё новая дата, а не новый срок.
  if (input.kind === 'task' && input.dueAt) return false;
  if (input.kind === 'seva' && input.sevaUntil) return false;
  const msLeft = expiresAt.getTime() - now.getTime();
  return msLeft <= VACANCY_RENEW_WINDOW_DAYS * DAY_MS;
}

/**
 * Новый срок при продлении. Отсчитывается от «сейчас», а не от старого
 * срока: иначе продление просроченного не давало бы ему ни дня жизни.
 */
export function renewedExpiresAt(kind: VacancyKind, now: Date): Date {
  return new Date(now.getTime() + DEFAULT_TTL_DAYS[kind] * DAY_MS);
}

/** Предложение считается живым — по данным, а не по статусу воркера. */
export function isLive(status: string, expiresAt: Date, now: Date): boolean {
  return status === 'published' && expiresAt.getTime() > now.getTime();
}
