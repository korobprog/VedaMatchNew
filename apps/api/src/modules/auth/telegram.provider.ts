import type { ProviderProfile } from './identity.service';
import type { TelegramUser } from './telegram-init-data';

/**
 * Telegram не сообщает почту, а у аккаунта портала она обязательна и
 * уникальна. Служебный адрес в зоне `.invalid` (RFC 2606) уникален по id
 * Telegram и гарантированно недоставляем: письмо туда не уйдёт, даже если
 * кто-то забудет его отфильтровать. Настоящую почту человек укажет в профиле.
 */
const PLACEHOLDER_DOMAIN = 'users.vedamatch.invalid';

export function telegramPlaceholderEmail(telegramId: number): string {
  return `tg-${telegramId}@${PLACEHOLDER_DOMAIN}`;
}

/** Для мест, где почту показывают или используют: админка, поддержка. */
export function isTelegramPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${PLACEHOLDER_DOMAIN}`);
}

/** Пользователь из подписанных данных мини-приложения → профиль для IdentityService. */
export function mapTelegramProfile(user: TelegramUser): ProviderProfile {
  const name = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return {
    provider: 'telegram',
    externalId: String(user.id),
    email: telegramPlaceholderEmail(user.id),
    name,
    avatarUrl: user.photoUrl,
  };
}
