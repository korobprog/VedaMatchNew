import type { AccessTokenPayload } from '@vedamatch/shared';

// Копия library/is-admin.ts: контракт сервисного модуля запрещает импортировать
// хелперы другого сервиса, а общего портального модуля для этого нет.
export function isAdmin(user: AccessTokenPayload): boolean {
  return user.role === 'admin' || user.role === 'service-admin';
}
