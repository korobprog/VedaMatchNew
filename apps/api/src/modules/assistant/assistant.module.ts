import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssistantAdminController } from './assistant-admin.controller';
import { AssistantAdminService } from './assistant-admin.service';
import { AssistantController } from './assistant.controller';
import { AssistantProviderService } from './assistant-provider.service';
import { AssistantQuotaService } from './assistant-quota.service';
import { AssistantSettingsService } from './assistant-settings.service';
import { AssistantToolsService } from './assistant-tools.service';
import { AssistantService } from './assistant.service';

/**
 * Ассистент портала — портальная инфраструктура, как уведомления или
 * общины: у него нет своих данных о сервисах, он спрашивает их событиями
 * `assistant.tool.<имя>` и получает ответ от слушателя внутри модуля-владельца.
 * Импортирует только AuthModule; PrismaService глобальный, EventEmitter2
 * инжектится напрямую. См. docs/service-module-contract.md.
 */
@Module({
  imports: [AuthModule],
  controllers: [AssistantController, AssistantAdminController],
  providers: [
    AssistantSettingsService,
    AssistantProviderService,
    AssistantQuotaService,
    AssistantToolsService,
    AssistantService,
    AssistantAdminService,
  ],
})
export class AssistantModule {}
