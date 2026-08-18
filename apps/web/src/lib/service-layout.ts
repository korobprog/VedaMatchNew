/**
 * Раскладка сервисов на главной: порядок карточек, закреплённая карточка и
 * режим показа.
 *
 * Всё живёт в одном ключе localStorage. Раньше туда писал только
 * `service-grid.tsx`, и логика чтения-записи лежала прямо в нём. Теперь у
 * ключа три читателя — сетка, советник и строка со счётчиком участников, —
 * и запись обязана быть общей: любой, кто сохранит только свою часть,
 * молча сотрёт чужую.
 *
 * Цена хранения на клиенте честная: выбрав компактный режим на телефоне,
 * человек снова увидит подробный на ноутбуке. Плата за это — ноль обращений
 * к серверу и ноль миграций.
 */

export type ServiceMode = "compact" | "detailed";

export interface ServiceLayout {
  order: string[];
  pinnedId: string | null;
  /**
   * null — человек ещё не выбирал режим и ни разу не открывал сервис.
   * Такому показываем подробный: по одному слову в плитке не понять, чем
   * «Сообщества» отличаются от «Контактов». Как только он откроет любой
   * сервис, поле становится "compact" — знакомство состоялось.
   */
  mode: ServiceMode | null;
}

export function layoutKey(userId: string): string {
  return `vedamatch:service-layout:${userId}`;
}

/**
 * Снимок для сервера и для сломанного хранилища. Один и тот же объект на
 * все вызовы: `useSyncExternalStore` сравнивает снимки по ссылке.
 */
const EMPTY: ServiceLayout = { order: [], pinnedId: null, mode: null };

export function serverLayout(): ServiceLayout {
  return EMPTY;
}

/**
 * Разбор хранилища. Мусор трактуется как «ничего не сохранено»: потерять
 * порядок карточек не страшно, уронить из-за испорченной строки главную —
 * страшно.
 */
export function parseLayout(raw: string | null): ServiceLayout {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return EMPTY;
    }
    const value = parsed as Record<string, unknown>;
    const order = Array.isArray(value.order)
      ? value.order.filter((id): id is string => typeof id === "string")
      : [];
    const pinnedId = typeof value.pinnedId === "string" ? value.pinnedId : null;
    const mode =
      value.mode === "compact" || value.mode === "detailed" ? value.mode : null;
    return { order, pinnedId, mode };
  } catch {
    return EMPTY;
  }
}

/** Режим, в котором показывать главную прямо сейчас. */
export function effectiveMode(layout: ServiceLayout): ServiceMode {
  return layout.mode ?? "detailed";
}

/* ------------------------------------------------------------------ */
/* Подписка для React                                                  */
/* ------------------------------------------------------------------ */

let cached: { key: string; raw: string | null; value: ServiceLayout } | null =
  null;
const listeners = new Set<() => void>();

function emit() {
  cached = null;
  for (const listener of listeners) listener();
}

export function subscribeToLayout(listener: () => void): () => void {
  listeners.add(listener);
  // События storage приходят из ДРУГИХ вкладок — свои изменения рассылаем
  // сами через emit(), браузер о них не уведомляет.
  const onStorage = () => emit();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readLayout(userId: string): ServiceLayout {
  const key = layoutKey(userId);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // Приватный режим может запретить хранилище — работаем на умолчаниях.
    return EMPTY;
  }
  if (cached && cached.key === key && cached.raw === raw) return cached.value;
  const value = parseLayout(raw);
  cached = { key, raw, value };
  return value;
}

/**
 * Сохраняет только переданные поля, остальные берёт из хранилища. Именно
 * ради этого модуль и появился: сетка сохраняет порядок, переключатель —
 * режим, и ни один не должен затирать другого.
 */
export function writeLayout(
  userId: string,
  patch: Partial<ServiceLayout>,
): void {
  try {
    const next = { ...readLayout(userId), ...patch };
    localStorage.setItem(layoutKey(userId), JSON.stringify(next));
  } catch {
    // Не сохранили — раскладка доживёт до перезагрузки, и только.
  }
  emit();
}

/**
 * Отметка «человек открыл сервис». Первый такой заход и переводит главную
 * в компактный режим. Явный выбор в переключателе не трогаем: если человек
 * сам вернулся к подробному, открытие сервиса не должно это отменять.
 */
export function markServiceOpened(userId: string): void {
  if (readLayout(userId).mode !== null) return;
  writeLayout(userId, { mode: "compact" });
}
