export type VideoProvider = 'youtube' | 'rutube';

export interface VideoSource {
  provider: VideoProvider;
  id: string;
}

/** Идентификаторы у обоих сервисов — латиница, цифры, дефис и подчёркивание. */
const ID_PATTERN = /^[\w-]{6,40}$/;

/** `null` — по адресу видео не опознано, встраивать нечего. */
export function videoSource(input: string): VideoSource | null {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const id = videoId(host, parsed);
  if (!id || !ID_PATTERN.test(id)) return null;
  return { provider: host.includes('rutube') ? 'rutube' : 'youtube', id };
}

function videoId(host: string, parsed: URL): string | null {
  if (host === 'youtu.be') return parsed.pathname.slice(1).split('/')[0] || null;
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (parsed.pathname === '/watch') return parsed.searchParams.get('v');
    const match = /^\/(?:shorts|embed|live)\/([^/]+)/.exec(parsed.pathname);
    return match?.[1] ?? null;
  }
  if (host === 'rutube.ru') {
    const match = /^\/(?:video|play\/embed|shorts)\/([^/]+)/.exec(
      parsed.pathname,
    );
    return match?.[1] ?? null;
  }
  return null;
}

/**
 * Адрес плеера для iframe.
 *
 * У YouTube берём домен без куки-трекинга: плеер работает так же, а читателей
 * библиотеки не опознают до того, как они сами нажмут «смотреть».
 */
export function videoEmbedUrl(input: string): string | null {
  const source = videoSource(input);
  if (!source) return null;
  return source.provider === 'rutube'
    ? `https://rutube.ru/play/embed/${source.id}/`
    : `https://www.youtube-nocookie.com/embed/${source.id}`;
}

/** Человекочитаемое имя источника — для подписи «смотреть на …». */
export function videoProviderName(provider: VideoProvider): string {
  return provider === 'rutube' ? 'Rutube' : 'YouTube';
}
