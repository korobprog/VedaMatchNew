/**
 * Как уходят вложения: сразу или после кнопки «Отправить».
 *
 * По умолчанию фото и файлы уходят сразу, как в мессенджерах: второе
 * нажатие после выбора читалось как лишнее подтверждение. Кому нужна
 * подпись к фото или несколько снимков в одном сообщении, выключает это —
 * тогда выбранное ждёт «Отправить». Голосовые уходят сразу всегда: их не
 * подписывают, а кнопка остановки обещает «остановить и отправить».
 *
 * Хранится на устройстве, как раскладка панели горячих кнопок: это привычка
 * руки, а не данные человека.
 */

export const CHAT_INSTANT_MEDIA_STORAGE_KEY = "vedamatch:chat-instant-media";

export const DEFAULT_INSTANT_MEDIA = true;

/** Незнакомое значение — умолчание: в хранилище может лежать мусор. */
export function parseInstantMedia(raw: string | null | undefined): boolean {
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return DEFAULT_INSTANT_MEDIA;
}

export function serializeInstantMedia(value: boolean): string {
  return value ? "1" : "0";
}

export function readInstantMedia(): boolean {
  try {
    return parseInstantMedia(
      window.localStorage.getItem(CHAT_INSTANT_MEDIA_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_INSTANT_MEDIA;
  }
}

export function writeInstantMedia(value: boolean): void {
  try {
    window.localStorage.setItem(
      CHAT_INSTANT_MEDIA_STORAGE_KEY,
      serializeInstantMedia(value),
    );
  } catch {
    // Приватный режим: выбор живёт до конца сессии.
  }
}
