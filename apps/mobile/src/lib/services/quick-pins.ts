import type { ServiceCard } from '@vedamatch/shared';
import { visibleServices } from './services-list';

/**
 * Панель быстрого доступа (VED-385): какие сервисы закреплены сверху и в
 * каком порядке. Здесь только правила; хранение — `quick-pins-store.ts`,
 * показ — `components/quick-bar/quick-bar.tsx`.
 *
 * Понятия взяты с сайта (`apps/web/src/components/quick/quick-actions.ts`):
 * разбор сохранённого набора молча отбрасывает непонятное, включённое встаёт
 * в конец, порядок меняется шагом, а не перетаскиванием. Сам НАБОР другой:
 * на сайте в панели девять действий (калькулятор, донат, афоризм…), здесь —
 * сервисы каталога `GET /services`. Общего словаря у них нет, поэтому и
 * общего хранения быть не может; почему выбор живёт на телефоне, а не на
 * сервере, — в описании PR и в `quick-pins-store.ts`.
 */

/**
 * Сколько сервисов можно закрепить.
 *
 * Пять. Чип — значок над именем, шириной по имени: у коротких имён
 * («Здоровье», «Рынок») это ~70 dp, у длинных («Образование») ~90. На
 * экране 412 dp (Galaxy A51, на котором проверяется приложение) пять
 * коротких встают целиком, пять длинных — с прокруткой на один чип. Шестой
 * уводил бы за край уже при любых именах, и панель стала бы вторым
 * каталогом, который надо листать, — а каталог уже есть, на вкладке
 * «Сервисы». Нижнее меню тоже из пяти пунктов: верх и низ читаются одной
 * сеткой.
 */
export const QUICK_PIN_LIMIT = 5;

/**
 * Закреплённый сервис — то, что нужно, чтобы нарисовать чип и открыть его
 * БЕЗ сети: имя для подписи, слаг для иконки и маршрута, адрес для сайта.
 *
 * Хранится снимок, а не только слаг: панель стоит на первом же экране после
 * запуска, и если ждать каталог с сервера, она появлялась бы через полсекунды
 * и сдвигала вниз весь экран чатов. Снимок освежается каждой загрузкой
 * каталога (`reconcilePins`) — переименование в админке доезжает при первом
 * заходе во «Сервисы» или при следующем запуске.
 */
export interface QuickPin {
  slug: string;
  name: string;
  url: string;
}

/**
 * Что вообще можно закрепить: видимые сервисы (без «Общения» и выключенных,
 * `visibleServices`), кроме «Скоро» — у такой карточки нет перехода, и чип,
 * ведущий в пустоту, отнимает у панели ровно то, ради чего она есть.
 */
export function pinnableServices(cards: readonly ServiceCard[]): ServiceCard[] {
  return visibleServices(cards).filter((card) => card.status === 'active');
}

export function pinFromService(service: Pick<ServiceCard, 'slug' | 'name' | 'url'>): QuickPin {
  return { slug: service.slug, name: service.name, url: service.url };
}

function isPin(value: unknown): value is QuickPin {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.slug === 'string' &&
    item.slug.trim() !== '' &&
    typeof item.name === 'string' &&
    item.name.trim() !== '' &&
    typeof item.url === 'string'
  );
}

/**
 * Разбор сохранённого набора. Ничего не сохранено — пусто: панель, которую
 * человек не просил, отнимала бы место наверху на каждой вкладке. Всё
 * непонятное — мимо, дубли — мимо (это сбой хранилища, а не выбор), сверх
 * предела — мимо: предел могли уменьшить в новой версии приложения.
 */
export function parseQuickPins(raw: string | null | undefined): QuickPin[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const result: QuickPin[] = [];
  for (const item of parsed) {
    if (!isPin(item) || seen.has(item.slug)) continue;
    seen.add(item.slug);
    result.push(pinFromService(item));
    if (result.length === QUICK_PIN_LIMIT) break;
  }
  return result;
}

export function serializeQuickPins(pins: readonly QuickPin[]): string {
  return JSON.stringify(pins.map(pinFromService));
}

export function isPinned(pins: readonly QuickPin[], slug: string): boolean {
  return pins.some((pin) => pin.slug === slug);
}

export function canPinMore(pins: readonly QuickPin[]): boolean {
  return pins.length < QUICK_PIN_LIMIT;
}

export type TogglePinOutcome = 'pinned' | 'unpinned' | 'full';

/**
 * Закрепить или открепить. Закреплённый встаёт в конец — туда, куда его и
 * кладут. Когда панель полна, набор не меняется, а исход `full` говорит
 * экрану, что объяснить человеку: молча не закрепить — худший ответ.
 */
export function togglePin(
  pins: readonly QuickPin[],
  service: Pick<ServiceCard, 'slug' | 'name' | 'url'>,
): { pins: QuickPin[]; outcome: TogglePinOutcome } {
  if (isPinned(pins, service.slug)) {
    return { pins: pins.filter((pin) => pin.slug !== service.slug), outcome: 'unpinned' };
  }
  if (!canPinMore(pins)) return { pins: [...pins], outcome: 'full' };
  return { pins: [...pins, pinFromService(service)], outcome: 'pinned' };
}

/**
 * Сдвинуть на шаг. Стрелками, а не перетаскиванием — по той же причине, что
 * и на сайте: панель настраивают одной рукой, и жест на пяти коротких
 * строках промахивается чаще, чем попадает. Стрелка ещё и доступна
 * TalkBack без особых жестов, а перетаскивание — нет.
 */
export function movePin(pins: readonly QuickPin[], slug: string, delta: -1 | 1): QuickPin[] {
  const at = pins.findIndex((pin) => pin.slug === slug);
  const to = at + delta;
  if (at === -1 || to < 0 || to >= pins.length) return [...pins];
  const next = [...pins];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/**
 * Свести снимок с каталогом: имя и адрес — свежие, порядок — человека.
 * Сервис, который пропал из каталога, выключен или ушёл в «Скоро», из панели
 * убирается — чип в никуда хуже, чем его отсутствие.
 */
export function reconcilePins(pins: readonly QuickPin[], cards: readonly ServiceCard[]): QuickPin[] {
  const bySlug = new Map(pinnableServices(cards).map((card) => [card.slug, card]));
  const result: QuickPin[] = [];
  for (const pin of pins) {
    const card = bySlug.get(pin.slug);
    if (card) result.push(pinFromService(card));
  }
  return result;
}

/** Совпадают ли два набора — чтобы не писать в хранилище то, что там уже лежит. */
export function samePins(a: readonly QuickPin[], b: readonly QuickPin[]): boolean {
  return serializeQuickPins(a) === serializeQuickPins(b);
}
