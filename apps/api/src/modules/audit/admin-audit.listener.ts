import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { AdminAuditEvent } from '@vedamatch/shared';
import { AdminAuditService } from './admin-audit.service';

/**
 * Единственная точка входа в журнал. Модули публикуют событие `admin.action`
 * через шину и о журнале ничего не знают — сервисный модуль иначе импортировал
 * бы чужой сервис, что запрещено контрактом.
 */
@Injectable()
export class AdminAuditListener {
  constructor(private readonly audit: AdminAuditService) {}

  @OnEvent('admin.action')
  onAdminAction(event: AdminAuditEvent): void {
    // Без await: запись в журнал не должна удлинять ответ на само действие.
    void this.audit.record(event);
  }
}
