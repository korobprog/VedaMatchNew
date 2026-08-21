import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { CatalogService } from './catalog.service';

@Controller('services')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /**
   * Публичный каталог: лендинг и шапка показывают названия сервисов гостю,
   * до всякой авторизации. Единственный намеренно открытый маршрут модуля —
   * как /stats/community у сводки.
   */
  @Get('public')
  publicList() {
    return this.catalog.getPublic();
  }

  @Get()
  @UseGuards(AuthGuard)
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.catalog.getForUser(user.sub, user.role);
  }
}
