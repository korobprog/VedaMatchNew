import type { AccessTokenPayload } from '@vedamatch/shared';

// Сообщества — портальная сущность, а не сервис: их видят все сервисы через
// read-only модели Community/CommunityMember. Поэтому здесь, в отличие от
// market/notices/library, роль service-admin прав не даёт — только admin.
export function isAdmin(user: AccessTokenPayload): boolean {
  return user.role === 'admin';
}
