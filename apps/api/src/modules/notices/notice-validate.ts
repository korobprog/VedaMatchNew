import {
  NOTICE_DESCRIPTION_MAX_LENGTH,
  NOTICE_TITLE_MAX_LENGTH,
  NOTICE_VENUE_MAX_LENGTH,
  type NoticeAudience,
  type NoticeKind,
  type NoticeRecurrence,
  type ProfileLocation,
} from '@vedamatch/shared';
import { hasEkadashiCalendar } from './ekadashi-dates';

export const NOTICE_KINDS: NoticeKind[] = ['offer', 'request', 'event', 'info'];
export const NOTICE_AUDIENCES: NoticeAudience[] = [
  'everyone',
  'my_city',
  'my_community',
];

export type NoticeValidationError =
  | 'title_required'
  | 'title_too_long'
  | 'description_too_long'
  | 'kind_invalid'
  | 'audience_invalid'
  | 'rubric_required'
  | 'location_invalid'
  | 'event_start_required'
  | 'event_end_before_start'
  | 'event_timezone_required'
  | 'venue_too_long'
  | 'online_url_required'
  | 'online_url_invalid'
  | 'community_audience_requires_community'
  | 'repeat_requires_event'
  | 'repeat_until_before_start'
  | 'ekadashi_calendar_missing';

export interface NoticeValidationInput {
  kind?: NoticeKind | null;
  rubricSlug?: string | null;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  audience?: NoticeAudience | null;
  location?: ProfileLocation | null;
  communityId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  timeZone?: string | null;
  venueName?: string | null;
  isOnline?: boolean;
  onlineUrl?: string | null;
  repeat?: NoticeRecurrence | null;
  repeatUntil?: string | null;
}

/**
 * Правила объявления. Возвращает первую нарушенную, а не список: форма на
 * вебе подсвечивает поля сама, серверу достаточно отказать — тот же приём,
 * что в market-listing-validate.ts.
 *
 * `isCreate` разводит создание и правку: при PATCH поля могут не приходить
 * вовсе, и это не значит «стереть».
 */
export function validateNotice(
  input: NoticeValidationInput,
  { isCreate }: { isCreate: boolean },
): NoticeValidationError | null {
  const kind = input.kind;
  if (isCreate || kind !== undefined) {
    if (!kind || !NOTICE_KINDS.includes(kind)) return 'kind_invalid';
  }
  if (isCreate && !input.rubricSlug?.trim()) return 'rubric_required';

  const titleGiven = input.titleRu !== undefined || input.titleEn !== undefined;
  if (isCreate || titleGiven) {
    const ru = input.titleRu?.trim() ?? '';
    const en = input.titleEn?.trim() ?? '';
    // Хотя бы один заголовок обязателен: карточка без названия нечитаема.
    if (!ru && !en) return 'title_required';
    if (
      ru.length > NOTICE_TITLE_MAX_LENGTH ||
      en.length > NOTICE_TITLE_MAX_LENGTH
    )
      return 'title_too_long';
  }

  for (const text of [input.descriptionRu, input.descriptionEn]) {
    if (text && text.length > NOTICE_DESCRIPTION_MAX_LENGTH)
      return 'description_too_long';
  }

  if (
    input.audience !== undefined &&
    input.audience !== null &&
    !NOTICE_AUDIENCES.includes(input.audience)
  )
    return 'audience_invalid';

  // «Только моей общине» без общины — объявление, которое не увидит никто.
  if (input.audience === 'my_community' && !input.communityId)
    return 'community_audience_requires_community';

  if (input.location && !isValidLocation(input.location))
    return 'location_invalid';

  if (input.venueName && input.venueName.length > NOTICE_VENUE_MAX_LENGTH)
    return 'venue_too_long';

  if (input.isOnline) {
    const url = input.onlineUrl?.trim();
    if (!url) return 'online_url_required';
    if (!isHttpUrl(url)) return 'online_url_invalid';
  }

  const effectiveKind = kind ?? (isCreate ? null : undefined);
  if (effectiveKind === 'event' || (input.startsAt ?? null) !== null) {
    const startsAt = parseDate(input.startsAt);
    if (effectiveKind === 'event' && !startsAt) return 'event_start_required';
    if (startsAt) {
      // Пояс обязателен рядом с датой: у онлайн-программы участники в разных
      // поясах, и «18:00» без пояса ничего не значит.
      if (!input.timeZone?.trim()) return 'event_timezone_required';
      const endsAt = parseDate(input.endsAt);
      if (endsAt && endsAt.getTime() < startsAt.getTime())
        return 'event_end_before_start';
    }
  }

  if (input.repeat && input.repeat !== 'none') {
    // Повторять можно только событие: у «отдам холодильник» нет даты, вокруг
    // которой строится повтор.
    if (effectiveKind !== undefined && effectiveKind !== 'event')
      return 'repeat_requires_event';
    // Экадаши — лунный календарь; без загруженной таблицы дат повтор дал бы
    // пустой календарь молча. Лучше отказать сразу.
    if (input.repeat === 'ekadashi' && !hasEkadashiCalendar())
      return 'ekadashi_calendar_missing';
    const startsAt = parseDate(input.startsAt);
    const until = parseDate(input.repeatUntil);
    if (startsAt && until && until < startsAt)
      return 'repeat_until_before_start';
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

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export const NOTICE_VALIDATION_MESSAGES: Record<NoticeValidationError, string> =
  {
    title_required: 'Напишите заголовок',
    title_too_long: `Заголовок длиннее ${NOTICE_TITLE_MAX_LENGTH} символов`,
    description_too_long: `Описание длиннее ${NOTICE_DESCRIPTION_MAX_LENGTH} символов`,
    kind_invalid: 'Выберите вид объявления',
    audience_invalid: 'Неизвестный круг видимости',
    rubric_required: 'Выберите рубрику',
    location_invalid: 'Город указан неверно',
    event_start_required: 'У события нужна дата и время начала',
    event_end_before_start: 'Событие заканчивается раньше, чем начинается',
    event_timezone_required: 'Укажите часовой пояс события',
    venue_too_long: `Название площадки длиннее ${NOTICE_VENUE_MAX_LENGTH} символов`,
    online_url_required: 'Дайте ссылку на онлайн-встречу',
    online_url_invalid: 'Ссылка должна начинаться с http:// или https://',
    community_audience_requires_community:
      'Чтобы показать объявление только общине, публикуйте его от её имени',
    repeat_requires_event: 'Повторять можно только событие с датой',
    repeat_until_before_start: 'Повтор кончается раньше, чем начинается',
    ekadashi_calendar_missing:
      'Календарь экадаши ещё не загружен — выберите другой повтор',
  };
