import * as Speech from 'expo-speech';

/**
 * Голос «Третьего глаза» — системный синтезатор Android через `expo-speech`.
 *
 * Свой голос, а не `AccessibilityInfo.announceForAccessibility`: объявление
 * TalkBack теряется, когда TalkBack занят, и его нет у тех, кто TalkBack не
 * включает (при глаукоме многие видят центром и обходятся без него). А с
 * Android 16 объявление и вовсе объявлено устаревшим.
 *
 * Каждая новая фраза обрывает предыдущую: устаревшее «Автобус 47» хуже
 * тишины, если к остановке уже подошёл другой.
 */

/**
 * Сказать и дождаться конца. Промис разрешается и по обрыву, и по ошибке:
 * живой режим ждёт тишины, а не успеха. Страховочный таймер — на движки,
 * которые не присылают `onDone` (встречается у сторонних синтезаторов).
 */
export function say(text: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      resolve();
    };
    // Русская речь ~15 символов в секунду; с запасом вдвое.
    const guard = setTimeout(done, Math.max(3_000, (text.length / rate) * 130));
    void Speech.stop()
      .catch(() => undefined)
      .then(() => {
        Speech.speak(text, {
          language: 'ru-RU',
          rate,
          onDone: done,
          onStopped: done,
          onError: done,
        });
      });
  });
}

export function hush(): void {
  void Speech.stop().catch(() => undefined);
}

export async function availableVoices(): Promise<{ language: string }[]> {
  try {
    return await Speech.getAvailableVoicesAsync();
  } catch {
    return [];
  }
}
