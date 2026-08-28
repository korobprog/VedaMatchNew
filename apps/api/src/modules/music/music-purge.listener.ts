import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { collectMusicPurgeKeys } from './music-purge-keys';

/**
 * Портал просит сервисы отдать ключи объектов удаляемого аккаунта.
 * Имя события дублируется в каждом сервисе — модули не импортируют друг друга.
 */
const USER_PURGE_REQUESTED = 'portal.user.purge-requested';

interface UserPurgeRequested {
  userId: string;
}

/**
 * Строки Музыки снесёт каскад от `User` — плейлисты, избранное, история,
 * загрузки, — а аудио в S3 каскадом не удаляется. Портал спрашивает ключи до
 * удаления строки (после каскада искать их негде) и чистит бакет сам.
 *
 * Отличие от Рынка и Объявлений: **не всё уходит**. У записи
 * `uploadedById` — `SetNull`, и опубликованное остаётся в каталоге без
 * автора: каталог принадлежит порталу, а не тому, кто принёс файл. Что
 * именно отдавать, решает `collectMusicPurgeKeys` — там же это и проверяется
 * тестом.
 *
 * Из этого следует то, чего нет у соседей: неопубликованные записи слушатель
 * удаляет **сам**. Каскад их не тронет — `SetNull` один на все строки, — а
 * файлы у них портал заберёт по нашему же плану. Оставить их значит завести
 * в каталоге строки, ссылающиеся в пустоту. Удаляем до того, как портал
 * снесёт `User`: событие приходит раньше.
 */
@Injectable()
export class MusicPurgeListener {
  private readonly logger = new Logger(MusicPurgeListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(USER_PURGE_REQUESTED)
  async collectStorageKeys(event: UserPurgeRequested) {
    const [tracks, uploads, playlists] = await Promise.all([
      this.prisma.musicTrack.findMany({
        where: { uploadedById: event.userId },
        select: { storageKey: true, publishedAt: true, coverKey: true },
      }),
      this.prisma.musicUpload.findMany({
        where: { uploaderId: event.userId },
        select: { storageKey: true },
      }),
      this.prisma.musicPlaylist.findMany({
        where: { ownerId: event.userId },
        select: { coverKey: true },
      }),
    ]);

    const plan = collectMusicPurgeKeys({ tracks, uploads, playlists });

    // Свои неопубликованные строки убираем сами: их файлы уже в плане, а
    // каскад по `SetNull` их не заберёт.
    if (plan.counts.musicTracks > 0) {
      await this.prisma.musicTrack.deleteMany({
        where: { uploadedById: event.userId, publishedAt: null },
      });
    }

    if (plan.storageKeys.length > 0 || plan.counts.musicTracksKept > 0) {
      this.logger.log(
        `Музыка пользователя ${event.userId}: ${plan.counts.musicTracks} записей уходит с файлами, ` +
          `${plan.counts.musicTracksKept} остаётся в каталоге без автора, всего ключей ${plan.storageKeys.length}`,
      );
    }

    return plan;
  }
}
