import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';

/** Имя события литералом — как в market-purge.listener.ts. */
const PURGE_REQUESTED = 'portal.user.purge-requested';

/**
 * Безвозвратное удаление аккаунта. Строки уходят каскадом, файлы в S3 — нет,
 * поэтому портал спрашивает ключи ДО удаления строки: после каскада искать их
 * негде.
 *
 * Ищем только по своим таблицам и только по userId. Отдаём фотографии
 * объектов, которыми человек владел единолично: у объекта с несколькими
 * управляющими карточка остаётся жить, и стирать её снимки нельзя.
 */
@Injectable()
export class TravelPurgeListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(PURGE_REQUESTED)
  async onPurgeRequested({ userId }: { userId: string }): Promise<{
    storageKeys: string[];
    counts: Record<string, number>;
  }> {
    const stays = await this.prisma.travelStay.findMany({
      // «Только он и никто больше»: every на пустой связи истинно, поэтому
      // рядом обязателен some — иначе под выборку попал бы объект вообще без
      // управляющих.
      where: {
        AND: [
          { managers: { every: { userId } } },
          { managers: { some: { userId } } },
        ],
      },
      select: { photoUrls: true },
    });
    const bookings = await this.prisma.travelBooking.count({
      where: { guestUserId: userId },
    });

    const storageKeys = stays.flatMap((stay) => stay.photoUrls);
    return {
      storageKeys,
      counts: { travelStays: stays.length, travelBookings: bookings },
    };
  }
}
