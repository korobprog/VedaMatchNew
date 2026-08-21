/**
 * Скрытие баннера новости.
 *
 * Хранится id последней закрытой новости, а не флаг «закрыто»: закрыв одну,
 * человек не должен пропустить следующую. Как и у карточек советника, это
 * localStorage — ноль обращений к серверу и ноль миграций; цена в том, что
 * закрытая на телефоне новость ещё раз мелькнёт на ноутбуке.
 *
 * Срока возврата здесь нет, в отличие от советов: совет напоминает о
 * незаполненном профиле и через неделю снова уместен, а прочитанная новость
 * второй раз не становится новостью.
 */

export const NEWS_DISMISSAL_KEY = "vedamatch:news-dismissed";

/** Скрыт ли баннер этой новости. Пустой `id` — новости нет, скрывать нечего. */
export function isNewsDismissed(
  dismissedId: string | null,
  id: string,
): boolean {
  return Boolean(id) && dismissedId === id;
}

/** Чтение хранилища. Любой мусор значит «ничего не скрыто». */
export function readNewsDismissal(raw: string | null): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

/**
 * Подписка на изменения хранилища для useSyncExternalStore. Событие `storage`
 * приходит из других вкладок, `dispatchNewsDismissal` — из текущей: закрыв
 * баннер, страница должна перерисоваться сразу.
 */
export function subscribeToNewsDismissal(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(NEWS_DISMISSAL_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(NEWS_DISMISSAL_EVENT, onChange);
  };
}

const NEWS_DISMISSAL_EVENT = "vedamatch:news-dismissed-change";

/** Текущее значение из localStorage; недоступное хранилище — «не скрыто». */
export function newsDismissalSnapshot(): string | null {
  try {
    return readNewsDismissal(localStorage.getItem(NEWS_DISMISSAL_KEY));
  } catch {
    return null;
  }
}

/** На сервере хранилища нет: первый кадр всегда «ничего не скрыто». */
export function serverNewsDismissal(): string | null {
  return null;
}

/** Запоминает закрытую новость и будит подписчиков текущей вкладки. */
export function rememberNewsDismissal(id: string): void {
  try {
    localStorage.setItem(NEWS_DISMISSAL_KEY, id);
  } catch {
    // Не сохранилось — новость вернётся на следующем заходе. Не повод падать.
  }
  window.dispatchEvent(new Event(NEWS_DISMISSAL_EVENT));
}
