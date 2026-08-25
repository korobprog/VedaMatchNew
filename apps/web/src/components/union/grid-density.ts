/**
 * Плотность списка на телефоне. Две колонки — крупные лица, но за экран
 * помещается 4-5 человек; три — 8-10, лица мельче, зато список выполняет
 * свою работу «быстро оглядеться». Что важнее, зависит от человека и
 * момента, поэтому выбор отдан ему и запоминается.
 */
export type GridDensity = 2 | 3;

export const DENSITY_STORAGE_KEY = "union.recommendations.density";

export const DEFAULT_DENSITY: GridDensity = 2;

/** Кнопка одна, поэтому переключение по кругу. */
export function nextDensity(current: GridDensity): GridDensity {
  return current === 2 ? 3 : 2;
}

/** Чужое или испорченное значение в localStorage не должно ломать список. */
export function parseDensity(raw: string | null): GridDensity {
  return raw === "3" ? 3 : DEFAULT_DENSITY;
}

export function densityClassName(density: GridDensity): string {
  // Классы записаны целиком: Tailwind сканирует исходники строками и
  // `grid-cols-${n}` в сборку не попадёт.
  return density === 3 ? "grid grid-cols-3 gap-1.5" : "grid grid-cols-2 gap-2";
}

/**
 * Подпись обещает результат нажатия, а не текущее состояние. Коротко: под
 * значком помещается одно слово, а смысл теперь несёт и сам значок.
 */
export function densityLabel(density: GridDensity): string {
  return density === 3 ? "Крупнее" : "Плотнее";
}
