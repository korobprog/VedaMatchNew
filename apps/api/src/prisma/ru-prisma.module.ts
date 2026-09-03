import { Global, Module } from '@nestjs/common';
import { RuPrismaService } from './ru-prisma.service';

/**
 * Клиент московской базы. Глобальный, как и обычный `PrismaModule`, но
 * обращаться к нему напрямую из сервисных модулей нельзя: только через
 * `PersonalDataService`. Иначе порядок записи «сначала Москва» разъедется по
 * коду и перестанет соблюдаться там, где о нём забыли.
 */
@Global()
@Module({
  providers: [RuPrismaService],
  exports: [RuPrismaService],
})
export class RuPrismaModule {}
