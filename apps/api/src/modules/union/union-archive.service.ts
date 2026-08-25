import { BadRequestException, Injectable } from '@nestjs/common';
import { resolveDisplayName } from '@vedamatch/shared';
import type { UnionArchiveListResponse } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Архив анкет: «убрать совсем», в отличие от пропуска, который живёт до
 * конца круга. Архивные не возвращаются в колоду даже при
 * `includeSwiped=true` — вернуть их можно только вручную из «Скрытых».
 */
@Injectable()
export class UnionArchiveService {
  constructor(private readonly prisma: PrismaService) {}

  async archive(ownerId: string, targetUserId: string): Promise<void> {
    if (ownerId === targetUserId) {
      throw new BadRequestException('cannot_archive_yourself');
    }
    // upsert, а не create: повторное нажатие на уже убранной анкете —
    // обычное дело (две вкладки, дрожащая рука), и падать на уникальном
    // индексе оно не должно.
    await this.prisma.unionArchive.upsert({
      where: {
        ownerId_archivedUserId: { ownerId, archivedUserId: targetUserId },
      },
      create: { ownerId, archivedUserId: targetUserId },
      update: {},
    });
  }

  async restore(ownerId: string, targetUserId: string): Promise<void> {
    // deleteMany, а не delete: отсутствующая пара — не ошибка, кнопку могли
    // нажать дважды.
    await this.prisma.unionArchive.deleteMany({
      where: { ownerId, archivedUserId: targetUserId },
    });
  }

  /** Кого прячем из выдачи всегда, независимо от фильтров. */
  async archivedUserIds(ownerId: string): Promise<Set<string>> {
    const rows = await this.prisma.unionArchive.findMany({
      where: { ownerId },
      select: { archivedUserId: true },
    });
    return new Set(rows.map((row) => row.archivedUserId));
  }

  async list(ownerId: string): Promise<UnionArchiveListResponse> {
    const rows = await this.prisma.unionArchive.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      select: {
        archivedUserId: true,
        createdAt: true,
        archivedUser: {
          select: {
            id: true,
            name: true,
            // Обязателен рядом с name: имя наружу собирает resolveDisplayName.
            spiritualName: true,
            avatarUrl: true,
            city: true,
            country: true,
          },
        },
      },
    });

    return {
      items: rows.map((row) => ({
        archivedAt: row.createdAt.toISOString(),
        user: {
          id: row.archivedUser.id,
          name: resolveDisplayName(row.archivedUser),
          avatarUrl: row.archivedUser.avatarUrl,
          // В списке архива хватает имени и города: галерею, возраст и
          // активность здесь не показываем — человек пришёл решать
          // «вернуть или нет», а не разглядывать анкету.
          photos: [],
          city: row.archivedUser.city,
          country: row.archivedUser.country,
          spiritualStage: null,
          age: null,
          activity: null,
          lastSeenAt: null,
          isVerifiedDevotee: false,
          isPhotoVerified: false,
          contacts: null,
        },
      })),
    };
  }
}
