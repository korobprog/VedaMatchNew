/**
 * Как уходят вложения: сразу или после кнопки «Отправить».
 *
 * По умолчанию фото и файлы ждут кнопки — так к ним можно приписать текст
 * или собрать несколько снимков в одно сообщение. Кому это лишний шаг,
 * включает мгновенную отправку. Голосовые уходят сразу всегда: их не
 * подписывают, а кнопка остановки и так обещает «остановить и отправить».
 *
 * Хранится на устройстве, как раскладка панели горячих кнопок: это привычка
 * руки, а не данные человека.
 */

export const CHAT_INSTANT_MEDIA_STORAGE_KEY = "vedamatch:chat-instant-media";

export function parseInstantMedia(raw: string | null | undefined): boolean {
  return raw === "1" || raw === "true";
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
    return false;
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
