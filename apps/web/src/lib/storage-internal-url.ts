/**
 * Адрес файла хранилища для запроса **с сервера сайта** (VED-508).
 *
 * Клиентам файлы отдаются с домена портала (`S3_PUBLIC_URL`, сейчас
 * https://media.vedamatch.ru — nginx-прокси portal/media-proxy): у старых
 * Android нет корня сертификата самого хранилища. Но сервер сайта до этого
 * домена не достаёт: запрос уходит на публичный адрес той же машины и не
 * возвращается. 24.09 так зависал манифест APK на лендинге, а превью ссылок
 * на афоризмы (`/m/[slug]/og`) отдавало 502 — мессенджеры показывали
 * карточку без картинки.
 *
 * Прокси передаёт в хранилище тот же путь и query, поэтому на сервере
 * достаточно вернуть origin хранилища (`S3_INTERNAL_URL`, в compose — тот же
 * `S3_UPSTREAM`, что у прокси). Ссылка не с публичного домена или не заданы
 * адреса — возвращается как есть.
 */
export function toInternalStorageUrl(
  url: string,
  publicUrl: string | undefined = process.env.S3_PUBLIC_URL,
  internalUrl: string | undefined = process.env.S3_INTERNAL_URL,
): string {
  const from = originOf(publicUrl);
  const to = originOf(internalUrl);
  if (!from || !to || from === to) return url;
  if (url !== from && !url.startsWith(`${from}/`)) return url;
  return to + url.slice(from.length);
}

function originOf(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
