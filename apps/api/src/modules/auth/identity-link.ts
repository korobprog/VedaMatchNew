import type { AuthProvider } from '@prisma/client';

/**
 * Чистые решения для привязки и отвязки способов входа (веха 3): кому
 * достаётся новая идентичность и можно ли отвязать последнюю. Вынесено из
 * `IdentityService`/`AuthController`, чтобы проверять правило без Prisma и
 * HTTP — тот же приём, что у `refresh-reuse.ts` рядом.
 */

export type LinkDecision = 'create' | 'noop' | 'conflict';

/**
 * `existingOwnerId` — владелец идентичности с той же парой
 * (provider, externalId), если она уже кому-то принадлежит; `null` —
 * свободна.
 *
 * Свой аккаунт — no-op (человек второй раз жмёт «Привязать» тот же
 * Google), чужой — отказ: способ входа не отбирается у другого человека.
 */
export function decideLink(
  existingOwnerId: string | null,
  currentUserId: string,
): LinkDecision {
  if (existingOwnerId === null) return 'create';
  return existingOwnerId === currentUserId ? 'noop' : 'conflict';
}

/** Последний способ входа отвязать нельзя — иначе аккаунт станет недоступен. */
export function canUnlink(identityCount: number): boolean {
  return identityCount > 1;
}

export const AUTH_PROVIDERS: readonly AuthProvider[] = [
  'google',
  'vk',
  'yandex',
  'email',
  'telegram',
];

/** Значение из URL (`:provider`) — доверия не заслуживает до проверки. */
export function isAuthProvider(value: string): value is AuthProvider {
  return (AUTH_PROVIDERS as readonly string[]).includes(value);
}
