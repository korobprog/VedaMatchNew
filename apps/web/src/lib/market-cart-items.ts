import { useSyncExternalStore } from "react";
import type { MarketCartDto } from "@vedamatch/shared";

// Количество по listingId — карточка товара показывает, что уже лежит в
// корзине, и подставляет степпер вместо кнопки «в корзину». Тот же приём,
// что у market-cart-badge.ts, но по каждому товару, а не общей суммой.
type Listener = () => void;

const listeners = new Set<Listener>();
let quantities: Record<string, number> = {};

export function getCartItemQuantity(listingId: string): number {
  return quantities[listingId] ?? 0;
}

/** Снимок для сервера: на SSR корзины ещё нет, иначе гидратация разъедется. */
function getCartItemQuantityServerSnapshot(): number {
  return 0;
}

export function setCartQuantities(next: Record<string, number>): void {
  quantities = next;
  for (const listener of listeners) listener();
}

/** Оптимистичный сдвиг после клика по степперу: точное число подтвердит ответ сервера. */
export function bumpCartItemQuantity(listingId: string, delta: number): void {
  const next = Math.max(0, (quantities[listingId] ?? 0) + delta);
  if (next === quantities[listingId]) return;
  quantities = { ...quantities, [listingId]: next };
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCartItemQuantity(listingId: string): number {
  return useSyncExternalStore(
    subscribe,
    () => getCartItemQuantity(listingId),
    getCartItemQuantityServerSnapshot,
  );
}

/** Считает количества по всем позициям корзины разом — недоступные позиции
 *  из заказа не выпадают, их тоже нужно показать на карточке. */
export function deriveCartQuantities(cart: MarketCartDto): Record<string, number> {
  const map: Record<string, number> = {};
  for (const group of cart.groups) {
    for (const item of group.items) map[item.listingId] = item.quantity;
  }
  for (const item of cart.unavailable) map[item.listingId] = item.quantity;
  return map;
}
