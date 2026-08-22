import { canAdminService } from '@vedamatch/shared';
import type { AccessTokenPayload } from '@vedamatch/shared';

// Копия notices/is-admin.ts: контракт сервисного модуля запрещает
// импортировать хелперы другого сервиса. Общее правило прав живёт в
// @vedamatch/shared, здесь дублируется только слаг.
export function isAdmin(user: AccessTokenPayload): boolean {
  return canAdminService(user, 'chat');
}
