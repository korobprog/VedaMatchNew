import { ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';

/**
 * Баллы и рефералы — портальная механика, как биллинг: они пересекают все
 * сервисы и не принадлежат ни одному. Поэтому доступ у роли `admin`, а не у
 * `service-admin` с каким-то слагом, и в `ADMIN_SERVICE_SLUGS` раздела нет.
 *
 * Копия проверки из billing.controller.ts: контракт сервисного модуля
 * запрещает импортировать хелперы чужого модуля, а общего портального для
 * этого нет.
 */
export function assertRewardsAdmin(user: AccessTokenPayload): void {
  if (user.role !== 'admin') {
    throw new ForbiddenException('Доступ только для администратора');
  }
}
