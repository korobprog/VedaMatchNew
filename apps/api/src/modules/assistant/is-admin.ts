import { canAdminService } from '@vedamatch/shared';
import type { AccessTokenPayload } from '@vedamatch/shared';

// Копия market/is-admin.ts: контракт сервисного модуля запрещает импортировать
// хелперы другого модуля. Общее правило прав живёт в @vedamatch/shared.
export function isAdmin(user: AccessTokenPayload): boolean {
  return canAdminService(user, 'assistant');
}
