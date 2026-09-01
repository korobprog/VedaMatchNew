import { Injectable } from '@nestjs/common';
import { isPortalStaff, type ActivityAccessSource } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Граф доступа портала: кто кому открыл свою активность.
 *
 * Портальная инфраструктура, как `ModerationModule`. Через неё, и только через
 * неё, читается `ActivityFollow` — сервисам заглядывать в эту таблицу нельзя,
 * а вопрос «этот зритель видит то, что человек показывает друзьям?» встаёт у
 * каждого второго: у ленты друзей, у Музыки с её плейлистами «для друзей», и
 * встанет у следующего сервиса с такой же видимостью.
 *
 * До появления этого модуля граф лежал внутри `activity`, и Музыке пришлось
 * закрыть видимость `friends` совсем: спросить было не у кого, а завести свою
 * копию графа значит разойтись с оригиналом на первом же отзыве доступа.
 *
 * Сам граф — зеркало `PortalAccessEvent`, а не первоисточник: доступ рождается
 * в Знакомствах и Общении, здесь он только сведён воедино. Поэтому модуль
 * ничего не решает про доступ, а лишь отвечает на вопрос о нём.
 */
@Injectable()
export class PortalAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Открыл ли `ownerId` свою активность зрителю `viewerId`.
   *
   * Себе видно всегда: без этого человек не увидит собственный плейлист «для
   * друзей», и это выглядит как потеря данных.
   */
  async canSeeActivity(viewerId: string, ownerId: string): Promise<boolean> {
    if (viewerId === ownerId) return true;

    // Администрация портала — друг всех: её видно каждому, и ей видно всех.
    // Строк в графе для этого не заводим: их было бы по две на аккаунт, и
    // при смене роли они остались бы висеть, см. isPortalStaff.
    if (await this.eitherIsStaff(viewerId, ownerId)) return true;

    const follow = await this.prisma.activityFollow.findFirst({
      where: { granterId: ownerId, granteeId: viewerId, revokedAt: null },
      select: { granterId: true },
    });

    return Boolean(follow);
  }

  /** Есть ли среди двоих администратор портала. */
  private async eitherIsStaff(
    viewerId: string,
    ownerId: string,
  ): Promise<boolean> {
    const rows = await this.prisma.user.findMany({
      where: { id: { in: [viewerId, ownerId] } },
      select: { role: true },
    });
    return rows.some((row) => isPortalStaff(row.role));
  }

  /** Кому `ownerId` открыл активность. Источник доступа — в значении. */
  async granteesOf(
    ownerId: string,
  ): Promise<Array<{ granteeId: string; source: ActivityAccessSource }>> {
    const rows = await this.prisma.activityFollow.findMany({
      where: { granterId: ownerId, revokedAt: null },
      select: { granteeId: true, source: true },
    });

    return rows.map((row) => ({
      granteeId: row.granteeId,
      source: row.source as ActivityAccessSource,
    }));
  }

  /** Кто открыл активность зрителю `viewerId`. */
  async grantersFor(
    viewerId: string,
  ): Promise<Array<{ granterId: string; source: ActivityAccessSource }>> {
    const rows = await this.prisma.activityFollow.findMany({
      where: { granteeId: viewerId, revokedAt: null },
      select: { granterId: true, source: true },
    });

    return rows.map((row) => ({
      granterId: row.granterId,
      source: row.source as ActivityAccessSource,
    }));
  }
}
