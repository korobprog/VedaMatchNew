import { BadRequestException } from '@nestjs/common';
import type {
  NotificationDevicePlatform,
  NotificationDeviceProvider,
  RegisterNotificationDeviceRequest,
} from '@vedamatch/shared';

const PROVIDERS: NotificationDeviceProvider[] = ['fcm', 'rustore'];
const PLATFORMS: NotificationDevicePlatform[] = ['android', 'ios'];
/** Токены FCM около 160 символов; запас на другие службы, но не на мусор. */
const MAX_TOKEN_LENGTH = 1024;
const MAX_VARIANT_LENGTH = 32;

export interface NormalizedDevice {
  token: string;
  provider: NotificationDeviceProvider;
  platform: NotificationDevicePlatform;
  appVariant: string | null;
}

/** Проверка тела регистрации телефона: DTO-валидаторов в модуле нет. */
export function normalizeDeviceRequest(body: unknown): NormalizedDevice {
  const input = (body ?? {}) as Partial<RegisterNotificationDeviceRequest>;
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  if (!token || token.length > MAX_TOKEN_LENGTH)
    throw new BadRequestException('Токен устройства обязателен');
  if (!PROVIDERS.includes(input.provider as NotificationDeviceProvider))
    throw new BadRequestException('Неизвестная служба доставки');
  if (!PLATFORMS.includes(input.platform as NotificationDevicePlatform))
    throw new BadRequestException('Неизвестная платформа');
  const appVariant =
    typeof input.appVariant === 'string' && input.appVariant.trim()
      ? input.appVariant.trim().slice(0, MAX_VARIANT_LENGTH)
      : null;
  return {
    token,
    provider: input.provider as NotificationDeviceProvider,
    platform: input.platform as NotificationDevicePlatform,
    appVariant,
  };
}
