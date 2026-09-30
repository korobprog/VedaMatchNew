import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TravelAdminController } from './admin/travel-admin.controller';
import { TravelAdminService } from './admin/travel-admin.service';
import { TravelCashController } from './cash/travel-cash.controller';
import { TravelCashTemplatesService } from './cash/travel-cash-templates.service';
import { TravelCashService } from './cash/travel-cash.service';
import { TravelGuestPhotosService } from './guests/travel-guest-photos.service';
import { TravelGuestsController } from './guests/travel-guests.controller';
import { TravelGuestsService } from './guests/travel-guests.service';
import { TravelMapAdminController } from './map/travel-map-admin.controller';
import { TravelMapController } from './map/travel-map.controller';
import { TravelMapPhotosService } from './map/travel-map-photos.service';
import { TravelMapService } from './map/travel-map.service';
import { TravelManageController } from './manage/travel-manage.controller';
import { TravelManageService } from './manage/travel-manage.service';
import { TravelPublicController } from './stays/travel-public.controller';
import { TravelPurgeListener } from './travel-purge.listener';
import { TravelController } from './stays/travel.controller';
import { TravelService } from './stays/travel.service';

/**
 * Сервис «Путешествия», разделы «Ночлег» и «Карта». По контракту сервисного модуля
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
    TravelMapAdminController,
    TravelMapController,
    TravelCashController,
    TravelGuestsController,
    TravelManageController,
    TravelPublicController,
    TravelController,
  ],
  providers: [
    TravelService,
    TravelManageService,
    TravelCashService,
    TravelCashTemplatesService,
    TravelGuestsService,
    TravelGuestPhotosService,
    TravelAdminService,
    TravelMapService,
    TravelMapPhotosService,
    TravelPurgeListener,
  ],
})
export class TravelModule {}
