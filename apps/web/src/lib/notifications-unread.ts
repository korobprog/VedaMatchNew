// Счётчик непрочитанного живёт в модуле, а не в состоянии колокольчика:
// страница списка гасит значок сразу после прочтения, не дожидаясь опроса,
// а Header монтируется на каждой странице заново.
type Listener = (count: number) => void;

const listeners = new Set<Listener>();
let current = 0;

export function getUnreadCount(): number {
  return current;
}

/** Снимок для сервера: на SSR значка ещё нет, иначе гидратация разъедется. */
export function getUnreadCountServerSnapshot(): number {
  return 0;
}

export function setUnreadCount(count: number): void {
  if (count === current) return;
  current = count;
  for (const listener of listeners) listener(count);
}

export function subscribeUnreadCount(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
