import { BadGatewayException } from '@nestjs/common';
import type { ProviderProfile } from './identity.service';

const AVATAR = 'https://avatars.yandex.net/get-yapic';

type YandexRaw = {
  id: string;
  default_email?: string;
  display_name?: string;
  real_name?: string;
  sex?: string | null;
  default_avatar_id?: string;
  is_avatar_empty?: boolean;
};

/**
 * Ответ login.yandex.ru/info → профиль для IdentityService. Чистая функция:
 * разбор ответа проверяется тестом отдельно от обмена кода на токен.
 */
export function mapYandexProfile(raw: YandexRaw): ProviderProfile {
  if (!raw.default_email) {
    throw new BadGatewayException('Яндекс не передал адрес почты');
  }

  const avatarUrl =
    raw.default_avatar_id && !raw.is_avatar_empty
      ? `${AVATAR}/${raw.default_avatar_id}/islands-200`
      : undefined;

  const gender = raw.sex === 'male' || raw.sex === 'female' ? raw.sex : undefined;

  return {
    provider: 'yandex',
    externalId: raw.id,
    email: raw.default_email,
    name: raw.real_name ?? raw.display_name ?? raw.default_email,
    avatarUrl,
    gender,
  };
}

export const YANDEX_AUTHORIZE = 'https://oauth.yandex.ru/authorize';
export const YANDEX_TOKEN = 'https://oauth.yandex.ru/token';
export const YANDEX_INFO = 'https://login.yandex.ru/info?format=json';
