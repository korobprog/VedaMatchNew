import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditListener } from './admin-audit.listener';
import { AdminAuditService } from './admin-audit.service';

/**
 * Журнал действий администрации. Ничего не экспортирует наружу: писать в него
 * можно только событием `admin.action`, читать — своим маршрутом.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminAuditController],
  providers: [AdminAuditService, AdminAuditListener],
})
export class AuditModule {}
