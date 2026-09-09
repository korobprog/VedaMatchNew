/**
 * Куда и чем можно поделиться. Чистая часть: сборка адресов и решение, какой
 * путь вообще существует, — без DOM, чтобы это можно было проверить тестом.
 *
 * Главное различие, из которого растёт весь экран: истории и статусы
 * принимают только файл, а переписка — ссылку. Instagram Stories, статус
 * WhatsApp, истории Telegram и ВКонтакте ссылку не разворачивают вовсе, им
 * нужно медиа; в чате наоборот удобнее ссылка — она показывает превью и
 * ведёт обратно в портал.
 */

/** Мессенджеры, у которых есть настоящий адрес «поделиться». */
export type MessengerId = "telegram" | "whatsapp" | "vk";

export const MESSENGER_LABELS: Record<MessengerId, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  vk: "ВКонтакте",
};

/**
 * Адрес «поделиться» для мессенджера.
 *
 * Собираем руками, а не системной шторкой: шторки нет на компьютере, а
 * кнопка обязана работать везде. Instagram и YouTube сюда не входят
 * намеренно — у первого такого адреса не существует, второй не адресат, туда
 * публикуют. Оба закрываются файлом: «сохранить» и «отправить в приложение».
 */
export function messengerLink(
  target: MessengerId,
  link: string,
  text: string,
): string {
  if (target === "telegram") {
    return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  }
  if (target === "vk") {
    return `https://vk.com/share.php?url=${encodeURIComponent(link)}&title=${encodeURIComponent(text)}`;
  }
  // WhatsApp принимает одну строку: ссылка идёт в конце, чтобы превью
  // цеплялось именно за неё.
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`;
}

/**
 * Текст для отправки: цитата, подпись источника и ссылка — каждое с новой
 * строки. Пустые части выпадают, лишних переносов не остаётся.
 */
export function shareText(parts: {
  text: string;
  source?: string | null;
  link?: string | null;
}): string {
  return [parts.text.trim(), parts.source?.trim(), parts.link?.trim()]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

/**
 * Адрес файла должен быть своим. Чужой домен здесь означал бы открытый
 * пересыльщик: кто угодно подставил бы в ссылку чужой адрес, а качалось бы
 * это с нашего имени. Плюс `download` и `fetch` для системной шторки на
 * чужом домене всё равно не работают — ради этого маршрут и заводили.
 */
export function isOwnFile(path: string | null | undefined): path is string {
  if (!path) return false;
  // `//example.com` — тоже чужой адрес, хотя и начинается со слэша.
  return path.startsWith("/") && !path.startsWith("//");
}
