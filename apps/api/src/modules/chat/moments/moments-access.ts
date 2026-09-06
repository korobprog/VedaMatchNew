import type { ChatMomentAudience } from '@vedamatch/shared';

/**
 * Кто видит момент.
 *
 * Снимка аудитории на момент публикации нет намеренно: отозванный доступ
 * обязан подействовать сразу, а таблица «кому показали» разъедется с графом
 * на первом же отзыве — ровно та ошибка, из-за которой Музыке пришлось
 * закрыть видимость «для друзей», пока граф лежал внутри чужого сервиса.
 */

export interface MomentViewerFacts {
  isAuthor: boolean;
  /** Автор открыл смотрящему свою активность — портальный граф доступа. */
  isGrantee: boolean;
  /** Между ними есть живой личный диалог. */
  isCompanion: boolean;
  /** Блокировка или скрытие в любую сторону. */
  hidden: boolean;
  /** Момент сгорел. */
  expired: boolean;
}

export type MomentDenial = 'gone' | 'not_in_audience' | 'hidden';

/**
 * `null` — показывать можно.
 *
 * Порядок проверок важен. Скрытие перебивает всё, включая собственное
 * авторство: заблокированному незачем узнавать, что момент вообще был.
 * Наружу все три причины отдаются одинаковым «не найдено» — разные ответы
 * позволяли бы перебором идентификаторов выяснить, публиковал ли человек
 * что-нибудь и кому он открыл доступ.
 */
export function denyMomentView(
  audience: ChatMomentAudience,
  facts: MomentViewerFacts,
): MomentDenial | null {
  if (facts.hidden) return 'hidden';
  if (facts.expired) return 'gone';
  // Себе видно всегда — иначе собственный момент выглядит как потеря данных.
  if (facts.isAuthor) return null;
  if (audience === 'everyone') return null;
  if (facts.isGrantee || facts.isCompanion) return null;
  return 'not_in_audience';
}

/**
 * Кому рассылать событие о новом моменте.
 *
 * Публичный момент веером по всему порталу не рассылается: у активного
 * человека это тысячи сообщений в Redis на каждую публикацию, а полоса колец
 * и так собирается заново при открытии списка бесед. Порог держит ту же
 * границу для моментов «для собеседников»: у кого аудитория больше, тот и
 * без события переживёт.
 */
export const MOMENT_FANOUT_LIMIT = 2000;

export function momentFanout(
  audience: ChatMomentAudience,
  audienceIds: readonly string[],
): string[] {
  if (audience === 'everyone') return [];
  if (audienceIds.length > MOMENT_FANOUT_LIMIT) return [];
  return [...new Set(audienceIds)];
}
