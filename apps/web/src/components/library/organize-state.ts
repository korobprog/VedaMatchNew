/**
 * Режим «Упорядочить» рубрик (VED-483): кнопка стоит в ряду кнопок
 * Образования, а дерево для перетаскивания рисует навигатор рубрик ниже.
 * Это разные места страницы, поэтому состояние — общий маленький стор, а не
 * `useState` одного из них.
 */
let organizing = false;
let listeners: Array<() => void> = [];

export function subscribeOrganizing(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function getOrganizing(): boolean {
  return organizing;
}

export function getOrganizingServer(): boolean {
  return false;
}

export function setOrganizing(next: boolean): void {
  if (organizing === next) return;
  organizing = next;
  for (const listener of listeners) listener();
}
