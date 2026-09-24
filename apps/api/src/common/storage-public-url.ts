/**
 * Подписанная ссылка на файл хранилища — с публичного домена портала.
 *
 * API ходит в S3 напрямую (`S3_ENDPOINT`, сейчас https://firsts3.ru), и
 * `getSignedUrl` выдаёт ссылку на этот хост. Клиентам её отдавать нельзя:
 * сертификат firsts3.ru выдан от корня GlobalSign Root R46, которого нет у
 * старых Android, и картинка/аудио там не открываются. Клиенты ходят через
 * прокси на своём домене (`S3_PUBLIC_URL`, portal/media-proxy), а он
 * передаёт в хранилище тот же путь и query с `Host` хранилища — поэтому
 * подпись, посчитанная на хост хранилища, остаётся верной, и менять в ссылке
 * нужно ровно origin.
 *
 * Если публичный адрес не задан, битый или совпадает с хранилищем по
 * origin — ссылка возвращается как есть: без прокси всё работает как раньше.
 */
export function toPublicStorageUrl(
  signedUrl: string,
  endpoint: string | undefined,
  publicUrl: string | undefined,
): string {
  const from = originOf(endpoint);
  const to = originOf(publicUrl);
  if (!from || !to || from === to) return signedUrl;
  if (signedUrl !== from && !signedUrl.startsWith(`${from}/`)) return signedUrl;
  return to + signedUrl.slice(from.length);
}

function originOf(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}
