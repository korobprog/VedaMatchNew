export interface NormalizedUrl {
  /** Исходный адрес — по нему идут переходы и обогащение. */
  url: string;
  /** Ключ дедупликации, уникален в базе. */
  normalized: string;
  domain: string;
}

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|yclid$|ref$|si$)/i;

export function normalizeUrl(input: string): NormalizedUrl {
  const raw = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('unsupported_url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('unsupported_url');
  }
  if (
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== '80' && parsed.port !== '443')
  ) {
    throw new Error('unsupported_url');
  }

  const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const youtubeId = extractYoutubeId(domain, parsed);
  const query = new URLSearchParams();

  if (youtubeId) {
    query.set('v', youtubeId);
  } else {
    for (const [key, value] of [...parsed.searchParams].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!TRACKING_PARAMS.test(key)) query.set(key, value);
    }
  }

  const path = youtubeId ? '/watch' : parsed.pathname.replace(/\/+$/, '') || '';
  const search = query.toString();
  const host = youtubeId ? 'youtube.com' : domain;

  return {
    url: raw,
    normalized: `https://${host}${path}${search ? `?${search}` : ''}`,
    domain: host,
  };
}

function extractYoutubeId(domain: string, parsed: URL): string | null {
  if (domain === 'youtu.be') return parsed.pathname.slice(1) || null;
  if (domain === 'youtube.com' && parsed.pathname === '/watch') {
    return parsed.searchParams.get('v');
  }
  return null;
}
