import {
  CHAT_MOMENT_BACKGROUNDS,
  CHAT_MOMENT_CAPTION_MAX_LENGTH,
  CHAT_MOMENT_MAX_PER_DAY,
  type ChatMomentAudience,
  type PublishChatMomentRequest,
} from '@vedamatch/shared';

/**
 * Проверка того, что приходит из браузера при публикации момента.
 *
 * Отдельным модулем от сервиса: у фотографии и записки разные обязательные
 * поля, и опубликованный момент без картинки — это чёрный прямоугольник во
 * весь экран, который автор увидит уже у чужих людей.
 */

export class MomentValidationError extends Error {}

export interface NormalizedMoment {
  kind: 'photo' | 'text';
  caption: string;
  url: string | null;
  width: number | null;
  height: number | null;
  background: number | null;
  audience: ChatMomentAudience;
}

/**
 * Подпись момента. Переводы строк схлопываются, а не запрещаются: текст
 * вставляют из заметок вместе с переносами, и отказывать за это — значит
 * спорить с человеком о том, как он держит буфер обмена. Длина считается
 * **после** схлопывания, иначе строка из пробелов отбивалась бы как длинная.
 * То же решение, что у строки статуса в профиле (`status-line.ts`).
 */
export function normalizeCaption(raw: string | undefined): string {
  const caption = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (caption.length > CHAT_MOMENT_CAPTION_MAX_LENGTH)
    throw new MomentValidationError(
      `Подпись длиннее ${CHAT_MOMENT_CAPTION_MAX_LENGTH} символов`,
    );
  return caption;
}

/**
 * Приводит запрос к тому, что можно писать в базу.
 *
 * `allowEveryone` решается тарифом и настройкой человека, а не запросом:
 * браузер присылает пожелание, но недоступная аудитория не отказ, а тихое
 * понижение до `contacts` — иначе публикация падала бы ошибкой ровно в тот
 * день, когда закончилась подписка.
 */
export function normalizePublish(
  dto: PublishChatMomentRequest,
  allowEveryone: boolean,
): NormalizedMoment {
  const caption = normalizeCaption(dto.caption);
  const audience: ChatMomentAudience =
    dto.audience === 'everyone' && allowEveryone ? 'everyone' : 'contacts';

  if (dto.kind === 'photo') {
    if (!dto.url) throw new MomentValidationError('Фотография не загружена');
    return {
      kind: 'photo',
      caption,
      url: dto.url,
      width: positive(dto.width),
      height: positive(dto.height),
      background: null,
      audience,
    };
  }

  if (dto.kind === 'text') {
    if (!caption) throw new MomentValidationError('Момент пустой');
    return {
      kind: 'text',
      caption,
      url: null,
      width: null,
      height: null,
      background: backgroundIndex(dto.background),
      audience,
    };
  }

  throw new MomentValidationError('Неизвестный вид момента');
}

/**
 * Номер подложки. Значение вне списка не отвергается, а сводится к первой
 * подложке: список ещё будет меняться, и старая ссылка на исчезнувший фон не
 * должна ронять публикацию.
 */
export function backgroundIndex(value: number | undefined): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= CHAT_MOMENT_BACKGROUNDS.length
  )
    return 0;
  return value;
}

/** Сколько ещё можно опубликовать сегодня. Ноль — лимит выбран. */
export function remainingToday(publishedToday: number): number {
  return Math.max(0, CHAT_MOMENT_MAX_PER_DAY - publishedToday);
}

export function assertUnderDailyLimit(publishedToday: number): void {
  if (remainingToday(publishedToday) === 0)
    throw new MomentValidationError(
      `Больше ${CHAT_MOMENT_MAX_PER_DAY} моментов в сутки не публикуется`,
    );
}

function positive(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return null;
  return Math.round(value);
}
