import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type {
  AccessTokenPayload,
  MusicOfflineAllowedRequest,
  MusicOfflineAllowedResponse,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { isAdmin } from './is-admin';
import {
  normalizeOfflineIds,
  offlineAllowedWhere,
} from './music-offline-query';

/**
 * Сверка сохранённого на устройстве. См. docs/music-service-plan.md, этап 9.
 *
 * Запись снимают по жалобе или по претензии правообладателя, и обещание
 * убрать её обязано действовать и на офлайн-копиях. Клиент присылает свои
 * идентификаторы, обратно получает те, что ещё разрешены; остальные стирает
 * у себя.
 *
 * Отвечаем разрешёнными, а не отозванными, намеренно: так неизвестный
 * идентификатор — опечатка, мусор из старой версии, чужая ссылка —
 * автоматически попадает в «убрать», а не остаётся навсегда из-за того, что
 * сервер о нём не знает.
 */
@Controller('music/offline')
@UseGuards(AuthGuard)
export class MusicOfflineController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('allowed')
  async allowed(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: MusicOfflineAllowedRequest,
  ): Promise<MusicOfflineAllowedResponse> {
    const ids = normalizeOfflineIds(body?.ids);
    if (ids.length === 0) return { ids: [] };

    const rows = await this.prisma.musicTrack.findMany({
      where: offlineAllowedWhere(ids, {
        userId: user.sub,
        isAdmin: isAdmin(user),
      }),
      select: { id: true },
    });

    return { ids: rows.map((row) => row.id) };
  }
}
