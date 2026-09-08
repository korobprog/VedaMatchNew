import {
  VACANCY_DESCRIPTION_MAX_LENGTH,
  VACANCY_SCHEDULE_MAX_LENGTH,
  VACANCY_TITLE_MAX_LENGTH,
  type ProfileLocation,
  type VacancyAudience,
  type VacancyEmployment,
  type VacancyKind,
  type VacancyPayInput,
  type VacancyPayPeriod,
  type VacancyPerk,
  type VacancySevaTerm,
  type VacancyWorkFormat,
} from '@vedamatch/shared';

export const VACANCY_KINDS: VacancyKind[] = ['work', 'seva', 'task'];
export const VACANCY_AUDIENCES: VacancyAudience[] = [
  'everyone',
  'my_city',
  'my_community',
];
export const VACANCY_WORK_FORMATS: VacancyWorkFormat[] = [
  'onsite',
  'remote',
  'hybrid',
];
export const VACANCY_EMPLOYMENTS: VacancyEmployment[] = [
  'full_time',
  'part_time',
  'project',
  'shift',
];
export const VACANCY_PAY_PERIODS: VacancyPayPeriod[] = [
  'month',
  'day',
  'hour',
  'task',
];
export const VACANCY_SEVA_TERMS: VacancySevaTerm[] = [
  'ongoing',
  'until',
  'event',
];
export const VACANCY_PERKS: VacancyPerk[] = [
  'prasad',
  'housing',
  'travel',
  'stipend',
];

/** Валюты, которые принимает форма. Список короткий намеренно. */
export const VACANCY_CURRENCIES = ['RUB', 'USD', 'EUR', 'INR'];

export type VacancyValidationError =
  | 'kind_invalid'
  | 'title_required'
  | 'title_too_long'
  | 'description_too_long'
  | 'audience_invalid'
  | 'community_audience_requires_community'
  | 'seva_requires_community'
  | 'location_invalid'
  | 'city_required'
  | 'work_format_invalid'
  | 'employment_invalid'
  | 'schedule_too_long'
  | 'pay_required'
  | 'pay_period_invalid'
  | 'pay_currency_invalid'
  | 'pay_negative'
  | 'pay_min_above_max'
  | 'seva_term_invalid'
  | 'seva_until_required'
  | 'seva_until_invalid'
  | 'seva_until_in_past'
  | 'perk_invalid'
  | 'due_at_invalid'
  | 'due_at_in_past';

export interface VacancyValidationInput {
  kind?: VacancyKind | null;
  title?: string | null;
  description?: string | null;
  audience?: VacancyAudience | null;
  location?: ProfileLocation | null;
  isRemote?: boolean;
  communityId?: string | null;
  workFormat?: VacancyWorkFormat | null;
  employment?: VacancyEmployment | null;
  schedule?: string | null;
  pay?: VacancyPayInput | null;
  sevaTerm?: VacancySevaTerm | null;
  sevaUntil?: string | null;
  perks?: VacancyPerk[];
  dueAt?: string | null;
}

/**
 * Правила предложения. Возвращает первую нарушенную, а не список: форма на
 * вебе подсвечивает поля сама, серверу достаточно отказать — тот же приём,
 * что в notice-validate.ts.
 *
 * `isCreate` разводит создание и правку: при PATCH поля могут не приходить
 * вовсе, и это не значит «стереть». Правила по виду проверяются, когда вид
 * известен: при создании — всегда, при правке — если прислали `kind` или
 * поле этого вида.
 */
export function validateVacancy(
  input: VacancyValidationInput,
  { isCreate, now }: { isCreate: boolean; now: Date },
): VacancyValidationError | null {
  const kind = input.kind ?? null;
  if (isCreate || input.kind !== undefined) {
    if (!kind || !VACANCY_KINDS.includes(kind)) return 'kind_invalid';
  }

  if (isCreate || input.title !== undefined) {
    const title = input.title?.trim() ?? '';
    if (!title) return 'title_required';
    if (title.length > VACANCY_TITLE_MAX_LENGTH) return 'title_too_long';
  }

  if (
    input.description &&
    input.description.length > VACANCY_DESCRIPTION_MAX_LENGTH
  )
    return 'description_too_long';

  if (
    input.audience !== undefined &&
    input.audience !== null &&
    !VACANCY_AUDIENCES.includes(input.audience)
  )
    return 'audience_invalid';

  // «Только моей общине» без общины — предложение, которое не увидит никто.
  if (input.audience === 'my_community' && !input.communityId)
    return 'community_audience_requires_community';

  // Служение публикуется только от лица общины: «нужны руки в храме» от
  // частного лица — главный способ выдать себя за храм.
  if (kind === 'seva' && isCreate && !input.communityId)
    return 'seva_requires_community';

  if (input.location && !isValidLocation(input.location))
    return 'location_invalid';

  if (input.schedule && input.schedule.length > VACANCY_SCHEDULE_MAX_LENGTH)
    return 'schedule_too_long';

  if (kind === 'work') {
    const error = validateWork(input, isCreate);
    if (error) return error;
  }
  if (kind === 'seva') {
    const error = validateSeva(input, isCreate, now);
    if (error) return error;
  }
  if (kind === 'task') {
    const error = validateTask(input, now);
    if (error) return error;
  }

  // Поля чужого вида могут приехать пустыми — их сервис не пишет, а вот
  // мусорные значения лучше отклонить, чем молча проигнорировать.
  if (input.workFormat && !VACANCY_WORK_FORMATS.includes(input.workFormat))
    return 'work_format_invalid';
  if (input.employment && !VACANCY_EMPLOYMENTS.includes(input.employment))
    return 'employment_invalid';
  if (input.sevaTerm && !VACANCY_SEVA_TERMS.includes(input.sevaTerm))
    return 'seva_term_invalid';
  if (input.perks?.some((perk) => !VACANCY_PERKS.includes(perk)))
    return 'perk_invalid';

  return null;
}

function validateWork(
  input: VacancyValidationInput,
  isCreate: boolean,
): VacancyValidationError | null {
  if (isCreate || input.workFormat !== undefined) {
    if (!input.workFormat || !VACANCY_WORK_FORMATS.includes(input.workFormat))
      return 'work_format_invalid';
  }
  // Офис и гибрид без города — вакансия, на которую нельзя приехать.
  const format = input.workFormat ?? null;
  if (isCreate && format !== 'remote' && !input.location?.city?.trim())
    return 'city_required';

  if (isCreate || input.pay !== undefined) {
    const pay = input.pay ?? null;
    const min = pay?.min ?? null;
    const max = pay?.max ?? null;
    // Оплата обязательна: либо вилка, либо честное «по договорённости».
    if (!pay?.negotiable && min === null && max === null) return 'pay_required';
    if ((min !== null && min < 0) || (max !== null && max < 0))
      return 'pay_negative';
    if (min !== null && max !== null && min > max) return 'pay_min_above_max';
    if (pay?.period && !VACANCY_PAY_PERIODS.includes(pay.period))
      return 'pay_period_invalid';
    if (pay?.currency && !VACANCY_CURRENCIES.includes(pay.currency))
      return 'pay_currency_invalid';
  }
  return null;
}

function validateSeva(
  input: VacancyValidationInput,
  isCreate: boolean,
  now: Date,
): VacancyValidationError | null {
  if (isCreate || input.sevaTerm !== undefined) {
    if (!input.sevaTerm || !VACANCY_SEVA_TERMS.includes(input.sevaTerm))
      return 'seva_term_invalid';
  }
  const term = input.sevaTerm ?? null;
  if (term === 'until' || term === 'event') {
    if (isCreate || input.sevaUntil !== undefined) {
      if (!input.sevaUntil) return 'seva_until_required';
      const until = parseDate(input.sevaUntil);
      if (!until) return 'seva_until_invalid';
      if (until.getTime() < now.getTime()) return 'seva_until_in_past';
    }
  }
  return null;
}

function validateTask(
  input: VacancyValidationInput,
  now: Date,
): VacancyValidationError | null {
  if (input.dueAt) {
    const dueAt = parseDate(input.dueAt);
    if (!dueAt) return 'due_at_invalid';
    if (dueAt.getTime() < now.getTime()) return 'due_at_in_past';
  }
  return null;
}

export function isValidLocation(location: ProfileLocation): boolean {
  if (typeof location.city !== 'string' || !location.city.trim()) return false;
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon))
    return false;
  if (location.lat < -90 || location.lat > 90) return false;
  if (location.lon < -180 || location.lon > 180) return false;
  return true;
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const VACANCY_VALIDATION_MESSAGES: Record<
  VacancyValidationError,
  string
> = {
  kind_invalid: 'Выберите вид предложения',
  title_required: 'Напишите заголовок',
  title_too_long: `Заголовок длиннее ${VACANCY_TITLE_MAX_LENGTH} символов`,
  description_too_long: `Описание длиннее ${VACANCY_DESCRIPTION_MAX_LENGTH} символов`,
  audience_invalid: 'Неизвестный круг видимости',
  community_audience_requires_community:
    'Чтобы показать предложение только общине, публикуйте его от её имени',
  seva_requires_community: 'Служение публикуется от имени общины',
  location_invalid: 'Город указан неверно',
  city_required: 'Укажите город или выберите удалённый формат',
  work_format_invalid: 'Выберите формат работы',
  employment_invalid: 'Неизвестный тип занятости',
  schedule_too_long: `График длиннее ${VACANCY_SCHEDULE_MAX_LENGTH} символов`,
  pay_required: 'Укажите оплату или отметьте «по договорённости»',
  pay_period_invalid: 'Неизвестный период оплаты',
  pay_currency_invalid: 'Неизвестная валюта',
  pay_negative: 'Оплата не может быть отрицательной',
  pay_min_above_max: 'Нижняя граница оплаты больше верхней',
  seva_term_invalid: 'Выберите срок служения',
  seva_until_required: 'Укажите, до какой даты нужно служение',
  seva_until_invalid: 'Дата служения указана неверно',
  seva_until_in_past: 'Дата служения уже прошла',
  perk_invalid: 'Неизвестное условие служения',
  due_at_invalid: 'Срок задачи указан неверно',
  due_at_in_past: 'Срок задачи уже прошёл',
};
