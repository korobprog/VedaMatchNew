import { Global, Module } from '@nestjs/common';
import { PersonalDataService } from './personal-data.service';

/**
 * Российский контур. Глобальный, чтобы точки записи могли внедрить сервис, не
 * импортируя фичевый модуль: по контракту сервисного модуля чужие фичевые
 * модули импортировать нельзя, а запись персональных данных — портальная
 * инфраструктура, как `PrismaService`.
 */
@Global()
@Module({
  providers: [PersonalDataService],
  exports: [PersonalDataService],
})
export class PersonalDataModule {}
