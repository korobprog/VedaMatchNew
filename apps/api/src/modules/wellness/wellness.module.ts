import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WellnessAdminController } from './wellness-admin.controller';
import { WellnessAdminService } from './wellness-admin.service';
import { WellnessAssistantListener } from './wellness-assistant.listener';
import { WellnessController } from './wellness.controller';
import { WellnessOpenFoodFactsService } from './wellness-openfoodfacts.service';
import { WellnessRecipeImportService } from './wellness-recipe-import.service';
import { WellnessRecipesService } from './wellness-recipes.service';
import { WellnessRecognizeService } from './wellness-recognize.service';
import { WellnessService } from './wellness.service';

/**
 * Сервис «Здоровье». По контракту сервисного модуля импортирует только
 * AuthModule; PrismaService глобальный, EventEmitter2 инжектится напрямую.
 *
 * Админский контроллер регистрируется первым: у него буквальный путь
 * `wellness/admin/...`, и он обязан встать раньше параметрических маршрутов
 * основного контроллера.
 */
@Module({
  imports: [AuthModule],
  controllers: [WellnessAdminController, WellnessController],
  providers: [
    WellnessService,
    WellnessOpenFoodFactsService,
    WellnessAdminService,
    WellnessRecognizeService,
    WellnessRecipesService,
    WellnessRecipeImportService,
    WellnessAssistantListener,
  ],
})
export class WellnessModule {}
