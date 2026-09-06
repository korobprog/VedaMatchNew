import type { MotivationAudioDto } from "@vedamatch/shared";

/**
 * Что играть следующим в фоне.
 *
 * Фон идёт по кругу и не повторяет одну запись подряд, пока есть другие:
 * человек читает подолгу, и та же флейта третий раз перестаёт быть фоном и
 * начинает мешать. Порядок задаёт редакция — перемешивать его мы не беремся,
 * просто идём по списку и возвращаемся в начало.
 */
export function nextAudioIndex(count: number, current: number): number {
  if (count <= 0) return 0;
  return (current + 1) % count;
}

/**
 * Громкость фона.
 *
 * Заметно тише обычной: под цитату ставят музыку, а не наоборот. Значение
 * держим здесь, чтобы оно не разъехалось между кнопкой и самим элементом
 * `audio`.
 */
export const BACKGROUND_VOLUME = 0.35;

/**
 * Есть ли что играть. Кнопку показываем, только когда редакция что-то
 * включила: молчащая кнопка хуже её отсутствия — так же решено у озвучки.
 */
export function hasBackgroundAudio(
  items: readonly MotivationAudioDto[] | undefined,
): boolean {
  return Boolean(items && items.length > 0);
}
