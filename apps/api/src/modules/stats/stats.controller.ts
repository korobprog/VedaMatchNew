import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AdminStatsService } from './admin-stats.service';
import { StatsService } from './stats.service';

/** Единственный намеренно публичный контроллер: без него лендинг для
 *  неавторизованных гостей не может показать живое число участников. */
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('community')
  community() {
    return this.stats.communityStats();
  }
}

/** Сводка для главной админки: только роль admin, у сервисных админов своя. */
@Controller('admin/stats')
@UseGuards(AuthGuard)
export class AdminStatsController {
  constructor(private readonly stats: AdminStatsService) {}

  @Get('portal')
  portal(@CurrentUser() user: AccessTokenPayload) {
    if (user.role !== 'admin')
      throw new ForbiddenException('Доступ только для администратора');
    return this.stats.portalStats();
  }
}
