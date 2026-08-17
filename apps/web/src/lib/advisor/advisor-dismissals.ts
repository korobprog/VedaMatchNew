/**
 * Скрытие карточек советника на неделю.
 *
 * Хранится в localStorage, как и порядок карточек сервисов в
 * `service-grid.tsx`. Цена решения честная: скрыв совет на телефоне, человек
 * снова увидит его на ноутбуке. Плата за это — ноль обращений к серверу и
 * ноль миграций, а сам совет через неделю всё равно вернётся, так что
 * рассинхрон живёт в худшем случае эти семь дней.
 *
 * Почему на неделю, а не навсегда: «дополните анкету» человек закроет в
 * первый день, и портал больше никогда об этом не напомнит — а пробел
 * останется. Возврат через неделю оставляет совету шанс, но не превращает
 * его в назойливость. Карточка, у которой повод исчез, не возвращается
 * вовсе: её просто перестаёт собирать `buildAdvisorCards`.
 */

/** Через сколько дней скрытая карточка возвращается. */
export const DISMISS_DAYS = 7;

/** cardId -> ISO-время, до которого карточка скрыта. */
export type Dismissals = Record<string, string>;

export function dismissalsKey(userId: string): string {
  return `vedamatch:advisor-dismissed:${userId}`;
}

/**
 * Разбор хранилища. Мусор трактуется как «ничего не скрыто»: потерять
 * скрытие не страшно, а уронить главную страницу из-за испорченной строки —
 * страшно.
 */
export function parseDismissals(raw: string | null): Dismissals {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: Dismissals = {};
    for (const [id, until] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof until === "string" && !Number.isNaN(Date.parse(until))) {
        result[id] = until;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Новое состояние после скрытия карточки. Заодно выбрасывает просроченные
 * записи — иначе ключ растёт вечно, накапливая идентификаторы советов,
 * которых давно нет.
 */
export function nextDismissals(
  current: Dismissals,
  cardId: string,
  now: Date,
): Dismissals {
  const until = new Date(now.getTime() + DISMISS_DAYS * 24 * 60 * 60 * 1000);
  const kept: Dismissals = {};
  for (const [id, value] of Object.entries(current)) {
    if (Date.parse(value) > now.getTime()) kept[id] = value;
  }
  kept[cardId] = until.toISOString();
  return kept;
}

/** Карточки, которые сейчас видно. */
export function visibleCards<T extends { id: string }>(
  cards: T[],
  dismissals: Dismissals,
  now: Date,
): T[] {
  return cards.filter((card) => {
    const until = dismissals[card.id];
    return !until || Date.parse(until) <= now.getTime();
  });
}

/* ------------------------------------------------------------------ */
/* Подписка для React                                                  */
/* ------------------------------------------------------------------ */

/**
 * Снимок кэшируется, потому что `useSyncExternalStore` сравнивает его по
 * ссылке: разбирая JSON на каждый вызов, мы отдавали бы каждый раз новый
 * объект, и React ушёл бы в бесконечную перерисовку.
 */
let cached: { key: string; raw: string | null; value: Dismissals } | null = null;
const listeners = new Set<() => void>();

function emit() {
  cached = null;
  for (const listener of listeners) listener();
}

export function subscribeToDismissals(listener: () => void): () => void {
  listeners.add(listener);
  // События storage приходят из ДРУГИХ вкладок — свои изменения мы
  // рассылаем сами через emit(), браузер о них не уведомляет.
  const onStorage = () => emit();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readDismissals(userId: string): Dismissals {
  const key = dismissalsKey(userId);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // Приватный режим может запретить хранилище — тогда просто не скрываем.
    return EMPTY;
  }
  if (cached && cached.key === key && cached.raw === raw) return cached.value;
  const value = parseDismissals(raw);
  cached = { key, raw, value };
  return value;
}

/**
 * Снимок для сервера. Один и тот же объект на все вызовы: на сервере
 * хранилища нет, а разметка должна совпасть с первым клиентским рендером,
 * иначе получим ошибку гидратации.
 */
const EMPTY: Dismissals = {};
export function serverDismissals(): Dismissals {
  return EMPTY;
}

export function writeDismissal(userId: string, cardId: string, now = new Date()) {
  try {
    const next = nextDismissals(readDismissals(userId), cardId, now);
    localStorage.setItem(dismissalsKey(userId), JSON.stringify(next));
  } catch {
    // Не сохранили — карточка исчезнет до перезагрузки, и только.
  }
  emit();
}
