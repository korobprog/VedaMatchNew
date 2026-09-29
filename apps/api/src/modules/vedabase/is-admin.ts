import { canAdminService } from '@vedamatch/shared';
import type { AccessTokenPayload } from '@vedamatch/shared';

// Копия library/is-admin.ts: контракт сервисного модуля запрещает импортировать
// хелперы другого сервиса. Общее правило прав — в @vedamatch/shared.
export function isAdmin(user: AccessTokenPayload): boolean {
  return canAdminService(user, 'vedabase');
}
