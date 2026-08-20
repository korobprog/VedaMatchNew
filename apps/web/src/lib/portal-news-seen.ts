/**
 * Какие новости портала человек уже закрыл.
 *
 * Хранится в браузере, а не на сервере: это не переписка и не заявка, отметка
 * нужна одному человеку на одном устройстве, и ради неё не стоит заводить
 * таблицу и запрос.
 *
 * Читается через `useSyncExternalStore`, а не эффектом — тем же приёмом, что
 * скрытия советника. Эффект дал бы либо `setState` в теле (правило
 * react-hooks/set-state-in-effect включено в этом репозитории как ошибка),
 * либо мигание: сервер отрисовал новость, клиент её убрал.
 */

const STORAGE_KEY = "vm:portal-news:seen";

/** Сколько отметок держим: старые новости всё равно уходят с главной. */
const LIMIT = 20;

/**
 * Снимок кэшируется, потому что `useSyncExternalStore` сравнивает его по
 * ссылке: разбирая JSON на каждый вызов, мы отдавали бы новый массив и
 * отправили бы React в бесконечную перерисовку.
 */
let cached: { raw: string | null; value: string[] } | null = null;
const listeners = new Set<() => void>();

/** До гидратации на сервере закрытых новостей нет — показываем всё. */
const EMPTY: string[] = [];

export function serverSeenNews(): string[] {
  return EMPTY;
}

function emit() {
  cached = null;
  for (const listener of listeners) listener();
}

export function subscribeToSeenNews(listener: () => void): () => void {
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

export function readSeenNews(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Приватный режим запрещает хранилище — покажем новость ещё раз, не беда.
    return EMPTY;
  }
  if (cached && cached.raw === raw) return cached.value;
  const value = parseSeen(raw);
  cached = { raw, value };
  return value;
}

/** Разбор хранилища: чужие и битые значения не должны ронять главную. */
export function parseSeen(raw: string | null): string[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return EMPTY;
  }
}

/** Новый список отметок: свежая впереди, без повторов, не длиннее лимита. */
export function withSeen(current: readonly string[], id: string): string[] {
  return [id, ...current.filter((seen) => seen !== id)].slice(0, LIMIT);
}

export function rememberSeenNews(id: string): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(withSeen(readSeenNews(), id)),
    );
  } catch {
    // Не смогли запомнить — покажем снова. Молча.
  }
  emit();
}
