import type { WellnessHistoryItem, WellnessScanKind } from '@vedamatch/shared';
import { verdictTone, verdictWord, type VerdictTone } from './verdict-copy';

/**
 * Строка истории проверок (VED-335).
 *
 * История нужна не ради архива: человек у полки сравнивает два похожих
 * продукта и через минуту не помнит, какой из них был какой. Поэтому в строке
 * сначала название, а «штрихкод 4600…» — только когда названия нет.
 */

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function time(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Когда проверяли. Сегодняшнее — временем: «в 14:05» отвечает на вопрос
 * «это до того, как я взял вторую пачку, или после». Вчерашнее и старше —
 * датой: точное время там уже не значит ничего.
 */
export function describeScanTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (sameDay(date, now)) return `сегодня в ${time(date)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return `вчера в ${time(date)}`;
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear()
    ? day
    : `${day} ${date.getFullYear()}`;
}

const KIND: Record<WellnessScanKind, string> = {
  barcode: 'штрихкод с камеры',
  manual: 'код набран вручную',
  photo: 'снимок состава',
};

export interface HistoryLine {
  title: string;
  subtitle: string;
  verdict: string;
  tone: VerdictTone;
  /** Всё сразу: скринридер читает строку целиком, а не по кускам. */
  accessibilityLabel: string;
}

export function describeHistoryItem(
  item: WellnessHistoryItem,
  now: Date = new Date(),
): HistoryLine {
  const title =
    item.productName ??
    (item.barcode ? `Штрихкод ${item.barcode}` : 'Снимок состава');
  const when = describeScanTime(item.createdAt, now);
  const subtitle = [when, KIND[item.kind]].filter(Boolean).join(' · ');
  const verdict = verdictWord(item.verdict);
  return {
    title,
    subtitle,
    verdict,
    tone: verdictTone(item.verdict),
    accessibilityLabel: `${title}. ${verdict}. Проверено ${subtitle}.`,
  };
}

export const HISTORY_EMPTY = {
  title: 'Проверок пока не было',
  body: 'Наведите камеру на штрихкод — проверенные продукты появятся здесь, чтобы не сравнивать их по памяти.',
} as const;
