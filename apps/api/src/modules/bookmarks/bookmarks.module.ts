import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksService } from './bookmarks.service';

/**
 * Закладки портала (VED-163). Портальный раздел, а не сервис каталога:
 * своей витрины у него нет, записи `Service` тоже — он хранит адреса чужих
 * страниц и ни в один сервис не ходит. По контракту сервисного модуля
 * импортирует только `AuthModule`; `PrismaService` глобальный.
 */
@Module({
  imports: [AuthModule],
  controllers: [BookmarksController],
  providers: [BookmarksService],
})
export class BookmarksModule {}
