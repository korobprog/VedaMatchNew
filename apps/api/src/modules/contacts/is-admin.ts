import { canAdminService } from '@vedamatch/shared';
import type { AccessTokenPayload } from '@vedamatch/shared';

// Копия market/is-admin.ts: контракт сервисного модуля запрещает импортировать
// хелперы другого сервиса, а общего портального модуля для этого нет. Общее
// правило прав живёт в @vedamatch/shared, здесь дублируется только слаг.
export function isAdmin(user: AccessTokenPayload): boolean {
  return canAdminService(user, 'contacts');
}
