import type {
  ProfileLocation,
  ProfileMessengers,
  ProfileSocialLinks,
} from '@vedamatch/shared';

const SOCIAL_KEYS: Array<keyof ProfileSocialLinks> = [
  'instagram',
  'telegram',
  'x',
  'facebook',
  'linkedin',
  'vk',
  'tiktok',
  'youtube',
  'website',
];
const MESSENGER_KEYS: Array<keyof ProfileMessengers> = [
  'telegram',
  'whatsapp',
  'mx',
  'phone',
];

export function parseLocation(value: unknown): ProfileLocation | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<ProfileLocation>;
  const city = sanitizeString(source.city, 120);
  const lat = Number(source.lat);
  const lon = Number(source.lon);
  if (!city || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    city,
    country: sanitizeString(source.country, 120) || undefined,
    lat,
    lon,
    displayName: sanitizeString(source.displayName, 240) || undefined,
  };
}

export function parseSocialLinks(value: unknown): ProfileSocialLinks {
  return sanitizeKeyValueMap(value as ProfileSocialLinks, SOCIAL_KEYS);
}

export function parseMessengers(value: unknown): ProfileMessengers {
  return sanitizeKeyValueMap(value as ProfileMessengers, MESSENGER_KEYS);
}

function sanitizeKeyValueMap<T extends object>(
  value: T | null | undefined,
  keys: readonly string[],
): T {
  const result: Record<string, string> = {};
  if (!value || typeof value !== 'object') return result as T;
  const source = value as Record<string, unknown>;
  for (const key of keys) {
    const sanitized = sanitizeString(source[key], 300);
    if (sanitized) result[key] = sanitized;
  }
  return result as T;
}

function sanitizeString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}
