export const swipeHintKey = "union:swipe-hint-seen";

/**
 * Подсказка о жесте показывается один раз и навсегда: свайп влево-вправо
 * запоминается с первого показа, а повторное «обучение» на каждом заходе в
 * колоду раздражало бы сильнее, чем помогало.
 *
 * Отметка живёт в localStorage, а не на сервере: она про этот телефон, а не
 * про человека. На новом устройстве жест снова показать уместно — экран там
 * другой, и рука привыкает к нему заново.
 */
export function isSwipeHintSeen(storage: Pick<Storage, "getItem">): boolean {
  try {
    return storage.getItem(swipeHintKey) === "1";
  } catch {
    // Приватный режим может бросать на доступе к хранилищу. Тогда считаем,
    // что человек подсказку не видел: лишний показ безобиднее пропущенного.
    return false;
  }
}

export function rememberSwipeHintSeen(storage: Pick<Storage, "setItem">): void {
  try {
    storage.setItem(swipeHintKey, "1");
  } catch {
    // Не смогли запомнить — не повод ронять колоду.
  }
  for (const listener of listeners) listener();
}

// Хранилище — внешний источник состояния, поэтому подсказка читает его через
// useSyncExternalStore, а не setState в эффекте: так нет ни лишнего рендера,
// ни расхождения с разметкой сервера.
let listeners: Array<() => void> = [];

export function subscribeSwipeHint(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function getSwipeHintSnapshot(): boolean {
  if (typeof window === "undefined") return true;
  return isSwipeHintSeen(window.localStorage);
}

/** На сервере считаем подсказку показанной: до гидратации решать нечем. */
export function getSwipeHintServerSnapshot(): boolean {
  return true;
}
