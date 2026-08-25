export const photoHintKey = "union:photo-hint-seen";

/**
 * Подсказка «тапните по краю фото» — тоже один раз и навсегда, как подсказка
 * о свайпе (см. [[swipe-hint-seen]]): это тот же приём про этот телефон, а не
 * про человека.
 *
 * Отдельный ключ, а не общий со свайпом: жесты разные и запоминаются
 * порознь — про свайп можно знать из других приложений, а про листание фото
 * тапом по половине снимка обычно нет.
 */
export function isPhotoHintSeen(storage: Pick<Storage, "getItem">): boolean {
  try {
    return storage.getItem(photoHintKey) === "1";
  } catch {
    // Приватный режим может бросать на доступе к хранилищу. Лишний показ
    // безобиднее пропущенного.
    return false;
  }
}

export function rememberPhotoHintSeen(storage: Pick<Storage, "setItem">): void {
  try {
    storage.setItem(photoHintKey, "1");
  } catch {
    // Не смогли запомнить — не повод ронять колоду.
  }
  for (const listener of listeners) listener();
}

// Хранилище — внешний источник состояния, поэтому подсказка читает его через
// useSyncExternalStore, а не setState в эффекте: так нет ни лишнего рендера,
// ни расхождения с разметкой сервера.
let listeners: Array<() => void> = [];

export function subscribePhotoHint(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function getPhotoHintSnapshot(): boolean {
  if (typeof window === "undefined") return true;
  return isPhotoHintSeen(window.localStorage);
}

/** На сервере считаем подсказку показанной: до гидратации решать нечем. */
export function getPhotoHintServerSnapshot(): boolean {
  return true;
}
