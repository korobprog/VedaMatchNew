/**
 * Открыто ли поверх страницы модальное окно (VED-499): окно задачи и
 * другие `aria-modal` накрывают полосу плеера затемнением, и поставить
 * музыку на паузу было нечем. Пока такое окно открыто, плеер показывает над
 * ним маленький пузырь «пуск / пауза».
 *
 * Свои окна плеера (панель настроек, очередь) не в счёт: они внутри
 * `[data-music-player]`, и пауза в них и так под рукой.
 */
export function hasForeignModal(root: ParentNode): boolean {
  for (const node of root.querySelectorAll('[aria-modal="true"]')) {
    if (!node.closest("[data-music-player]")) return true;
  }
  return false;
}

export function subscribeModals(listener: () => void): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(listener);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-modal"],
  });
  return () => observer.disconnect();
}

export function getModalOpen(): boolean {
  return typeof document !== "undefined" && hasForeignModal(document);
}

export function getModalOpenServer(): boolean {
  return false;
}
