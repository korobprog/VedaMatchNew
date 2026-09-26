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
 * YouTube — основной домен, а не `youtube-nocookie` (VED-536): на телефоне
 * плеер без куки крутил загрузку и не запускался — без куки YouTube не
 * узнаёт зрителя и при VPN требует подтвердить, что это не бот, а внутри
 * встроенного плеера подтвердить нечем. Трекеров до нажатия всё равно нет:
 * iframe появляется только по «смотреть» (`VideoEmbed`). `playsinline=1` —
 * играть на месте, а не разворачиваться на весь экран сразу.
 */
export function videoEmbedUrl(input: string): string | null {
  const source = videoSource(input);
  if (!source) return null;
  return source.provider === 'rutube'
    ? `https://rutube.ru/play/embed/${source.id}/`
    : `https://www.youtube.com/embed/${source.id}?playsinline=1`;
}

/** Человекочитаемое имя источника — для подписи «смотреть на …». */
export function videoProviderName(provider: VideoProvider): string {
  return provider === 'rutube' ? 'Rutube' : 'YouTube';
}
