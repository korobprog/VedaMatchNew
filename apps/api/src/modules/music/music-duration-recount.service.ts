import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decideRecountedDuration } from './music-duration-recount';
import { MusicMetadataReader } from './music-metadata-reader';
import { MusicStorageService } from './music-storage.service';

/**
 * Сколько записей сверяет один тик. Каждая — это файл из бакета целиком
 * (киртан на сорок минут — до сотни мегабайт), поэтому по чуть-чуть: весь
 * каталог прода проходит за пару часов, не забивая канал API.
 */
export const DURATION_RECOUNT_BATCH = 3;

/**
 * Пересчёт длительности записей по файлу (VED-310).
 *
 * Очередь — записи с пустым `durationCheckedAt`: после миграции это весь
 * каталог, дальше — каждая новая загрузка и позиция приёма. Так «впредь
 * брать длительность из файла» выполняется без того, чтобы держать запрос
 * загрузки открытым на время чтения сотни мегабайт: при загрузке ставится
 * оценка, через минуту-другую стадия меняет её на точное число.
 *
 * Устройство — по образцу `MotivationWorkerService`: клейм строки через
 * `updateMany` с проверкой, что её ещё никто не взял, так что два процесса
 * одну запись не читают. Отметка ставится до чтения: запись с битым файлом
 * не должна вставать первой в очередь на каждом тике и держать остальных.
 * Такие записи остаются с прежним числом и видны в логе; вернуть в очередь
 * — `UPDATE "MusicTrack" SET "durationCheckedAt" = NULL WHERE id = …`.
 */
@Injectable()
export class MusicDurationRecountService {
  private readonly logger = new Logger(MusicDurationRecountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MusicStorageService,
    private readonly metadata: MusicMetadataReader,
  ) {}

  /** Сверяет следующую пачку. Возвращает, у скольких число поменялось. */
  async recountNext(
    limit = DURATION_RECOUNT_BATCH,
    now: Date = new Date(),
  ): Promise<number> {
    // Без хранилища читать нечего, и отмечать записи сверенными нельзя:
    // иначе окружение без бакета «сверило» бы весь каталог вхолостую.
    if (!this.storage.configured) return 0;

    const queue = await this.prisma.musicTrack.findMany({
      where: { durationCheckedAt: null },
      select: {
        id: true,
        storageKey: true,
        mime: true,
        sizeBytes: true,
        durationSeconds: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    let changed = 0;
    for (const track of queue) {
      const claimed = await this.prisma.musicTrack.updateMany({
        where: { id: track.id, durationCheckedAt: null },
        data: { durationCheckedAt: now },
      });
      if (claimed.count === 0) continue;

      const stream = await this.storage.getStream(track.storageKey);
      if (!stream) {
        this.logger.warn(`Длительность ${track.id}: файл не открылся`);
        continue;
      }

      let parsed: number | null;
      try {
        parsed = await this.metadata.readDuration(
          stream,
          track.mime,
          track.sizeBytes,
        );
      } finally {
        // Разбор мог остановиться раньше конца файла — соединение с бакетом
        // не должно висеть до таймаута.
        stream.destroy();
      }

      const decision = decideRecountedDuration({
        parsedSeconds: parsed,
        currentSeconds: track.durationSeconds,
      });
      if (decision.kind === 'unreadable') {
        this.logger.warn(`Длительность ${track.id}: не прочиталась по файлу`);
        continue;
      }
      if (decision.kind === 'keep') continue;

      await this.prisma.musicTrack.update({
        where: { id: track.id },
        data: { durationSeconds: decision.seconds },
      });
      changed += 1;
      this.logger.log(
        `Длительность ${track.id}: ${track.durationSeconds} → ${decision.seconds} с`,
      );
    }
    return changed;
  }
}
