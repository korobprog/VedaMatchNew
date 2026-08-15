// Счётчик корзины живёт в модуле, а не в состоянии значка: кнопка «в корзину»
// на карточке товара двигает его сразу, не дожидаясь опроса, а Header
// монтируется на каждой странице заново.
type Listener = (count: number) => void;

const listeners = new Set<Listener>();
let current = 0;

export function getCartCount(): number {
  return current;
}

/** Снимок для сервера: на SSR значка ещё нет, иначе гидратация разъедется. */
export function getCartCountServerSnapshot(): number {
  return 0;
}

export function setCartCount(count: number): void {
  if (count === current) return;
  current = count;
  for (const listener of listeners) listener(count);
}

/** Оптимистичный сдвиг после добавления: точное число придёт следующим опросом. */
export function bumpCartCount(delta: number): void {
  setCartCount(Math.max(0, current + delta));
}

export function subscribeCartCount(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
