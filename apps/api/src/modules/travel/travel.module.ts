import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TravelAdminController } from './travel-admin.controller';
import { TravelAdminService } from './travel-admin.service';
import { TravelManageController } from './travel-manage.controller';
import { TravelManageService } from './travel-manage.service';
import { TravelPurgeListener } from './travel-purge.listener';
import { TravelController } from './travel.controller';
import { TravelService } from './travel.service';

/**
 * Сервис «Путешествия», раздел «Ночлег». По контракту сервисного модуля
 * импортирует только AuthModule; PrismaService глобальный, EventEmitter2
 * инжектится напрямую.
 *
 * Порядок контроллеров важен: у админского и управляющего пути буквальные
 * (`travel/admin/...`, `travel/manage/...`), и они обязаны встать раньше
 * параметрических маршрутов основного контроллера.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    TravelAdminController,
    TravelManageController,
    TravelController,
  ],
  providers: [
    TravelService,
    TravelManageService,
    TravelAdminService,
    TravelPurgeListener,
  ],
})
export class TravelModule {}
