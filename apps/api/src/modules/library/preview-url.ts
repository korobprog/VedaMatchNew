/**
 * Обложка материала по адресу ссылки.
 *
 * YouTube отдаётся синхронно — идентификатор видео есть в самом URL.
 * Rutube требует запроса в oEmbed, поэтому он best-effort: любая ошибка
 * или таймаут означают «превью нет», добавление ссылки от этого не падает.
 */

const RUTUBE_OEMBED = 'https://rutube.ru/api/oembed/';
const OEMBED_TIMEOUT_MS = 3000;
const RUTUBE_IMAGE_HOSTS = /(^|\.)(rutube\.ru|rutubelist\.ru)$/;

export function youtubePreviewUrl(input: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const id = youtubeVideoId(host, parsed);
  if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function youtubeVideoId(host: string, parsed: URL): string | null {
  if (host === 'youtu.be')
    return parsed.pathname.slice(1).split('/')[0] || null;
  if (host !== 'youtube.com' && host !== 'm.youtube.com') return null;
  if (parsed.pathname === '/watch') return parsed.searchParams.get('v');
  const match = /^\/(?:shorts|embed|live)\/([^/]+)/.exec(parsed.pathname);
  return match?.[1] ?? null;
}

export function isRutubeUrl(input: string): boolean {
  try {
    const host = new URL(input).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'rutube.ru';
  } catch {
    return false;
  }
}

async function rutubePreviewUrl(input: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${RUTUBE_OEMBED}?url=${encodeURIComponent(input)}&format=json`,
      { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS) },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { thumbnail_url?: unknown };
    const thumbnail = payload.thumbnail_url;
    if (typeof thumbnail !== 'string') return null;

    const parsed = new URL(thumbnail);
    if (parsed.protocol !== 'https:') return null;
    if (!RUTUBE_IMAGE_HOSTS.test(parsed.hostname.toLowerCase())) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** `null` — обложку по этой ссылке получить не удалось. */
export async function resolvePreviewUrl(input: string): Promise<string | null> {
  const youtube = youtubePreviewUrl(input);
  if (youtube) return youtube;
  if (isRutubeUrl(input)) return rutubePreviewUrl(input);
  return null;
}
