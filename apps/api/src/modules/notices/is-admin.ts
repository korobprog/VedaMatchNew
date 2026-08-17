import type { AccessTokenPayload } from '@vedamatch/shared';

// Копия market/is-admin.ts: контракт сервисного модуля запрещает импортировать
// хелперы другого сервиса, а общего портального для этого нет.
export function isAdmin(user: AccessTokenPayload): boolean {
  return user.role === 'admin' || user.role === 'service-admin';
}
