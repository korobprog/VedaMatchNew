import type { AccessTokenPayload } from '@vedamatch/shared';

export function isAdmin(user: AccessTokenPayload): boolean {
  return user.role === 'admin' || user.role === 'service-admin';
}
