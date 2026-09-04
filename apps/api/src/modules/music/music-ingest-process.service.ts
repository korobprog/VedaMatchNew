import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { MusicIngestSource } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  INGEST_BATCH_SIZE,
  mimeFromStorageKey,
  nextStateAfterFailure,
} from './ingest-process-rules';
import { batchStatusFor, isItemStale } from './ingest-state';
import {
  buildMusicCoverKey,
  coverExtensionFor,
  MUSIC_COVER_MAX_BYTES,
} from './music-cover-validate';
import {
  readId3v2Size,
  resolveDurationSeconds,
} from './music-duration-estimate';
import {
  extractEmbeddedCover,
  fallbackTrackTitle,
  normalizeAudioMetadata,
} from './music-metadata-parse';
import type { EmbeddedCover } from './music-metadata-parse';
import { MusicMetadataReader } from './music-metadata-reader';
import { MusicStorageService } from './music-storage.service';
import {
  MUSIC_UPLOAD_DEFAULT_LIMITS,
  MUSIC_UPLOAD_REJECTION_TEXT,
  validateMusicUploadCompletion,
} from './music-upload-validate';
import type { MusicUploadLimits } from './music-upload-validate';

/**
 * Общая дорога позиции после доставки: проверка объекта, разбор тегов,
 * черновой трек.
 *
 * Отдельным сервисом от `MusicIngestService`: тот отвечает за учёт и права,
 * этот — за работу с файлом, и связь между ними односторонняя. Учёт зовёт
 * обработку, обработка про учёт не знает и ходит в базу сама, поэтому
 * `forwardRef` здесь не нужен.
 *
 * Устойчивость — по образцу `MotivationWorkerService`: клейм строки через
 * `updateMany` с проверкой статуса, счётчик попыток, возврат зависших по
 * `updatedAt`.
 */
@Injectable()
export class MusicIngestProcessService {
  private readonly logger = new Logger(MusicIngestProcessService.name);
  private readonly limits: MusicUploadLimits;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MusicStorageService,
    private readonly metadata: MusicMetadataReader,
    config: ConfigService,
  ) {
    // Пределы те же, что у людей, и читаются из окружения так же: потолок
    // объёма — вопрос денег за S3, а не кода.
    const num = (key: string, fallback: number) => {
      const raw = config.get<string>(key);
      const parsed = raw === undefined ? Number.NaN : Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };

    this.limits = {
      maxBytes: num(
        'MUSIC_MAX_UPLOAD_BYTES',
        MUSIC_UPLOAD_DEFAULT_LIMITS.maxBytes,
      ),
      maxDurationSeconds: num(
        'MUSIC_MAX_DURATION_SECONDS',
        MUSIC_UPLOAD_DEFAULT_LIMITS.maxDurationSeconds,
      ),
      maxBitrateKbps: num(
        'MUSIC_MAX_BITRATE_KBPS',
        MUSIC_UPLOAD_DEFAULT_LIMITS.maxBitrateKbps,
      ),
      accountQuotaBytes: num(
        'MUSIC_ACCOUNT_QUOTA_BYTES',
        MUSIC_UPLOAD_DEFAULT_LIMITS.accountQuotaBytes,
      ),
    };
  }

  /**
   * Один заход очереди. Возвращает, сколько позиций обработано, — по этому
   * числу видно, что стадия жива.
   *
   * Первый запрос дешёвый и по индексу `(status, updatedAt)`: при пустой
   * очереди стадия уходит, ничего больше не спросив. Тик у приёма частый, и
   * позволить себе обход таблицы каждые пятнадцать секунд она не может.
   */
  async processOnce(): Promise<number> {
    const queued = await this.prisma.musicIngestItem.findMany({
      where: { status: 'waiting' },
      // Порядок партии важнее порядка появления: позиции одной партии идут
      // подряд, и админ видит, как таблица заполняется сверху вниз.
      orderBy: [{ createdAt: 'asc' }, { position: 'asc' }],
      take: INGEST_BATCH_SIZE,
      select: { id: true },
    });
    if (queued.length === 0) return 0;

    const touched = new Set<string>();
    let processed = 0;

    for (const row of queued) {
      const item = await this.claim(row.id);
      // Строку успел взять другой процесс — его работа, не наша.
      if (!item) continue;
      touched.add(item.batchId);
      processed += 1;

      try {
        await this.processItem(item);
      } catch (error) {
        this.logger.warn(
          `Позиция ${item.id} не обработалась: ${String(error)}`,
        );
        await this.recordFailure(item, 'Не удалось обработать файл');
      }
    }

    for (const batchId of touched) await this.refreshStatus(batchId);
    return processed;
  }

  /**
   * Вернуть в очередь позиции, взятые в работу и с тех пор молчащие:
   * процесс, который их клеймил, до них уже не вернётся. Счётчик попыток при
   * этом не сбрасывается — иначе позиция, роняющая процесс, ходила бы по
   * кругу вечно.
   */
  async reviveStale(now: Date = new Date()): Promise<number> {
    const candidates = await this.prisma.musicIngestItem.findMany({
      where: { status: 'fetching' },
      select: { id: true, status: true, updatedAt: true },
      take: 100,
    });

    let revived = 0;
    for (const item of candidates) {
      if (!isItemStale(item, now)) continue;
      // Клейм: `updatedAt` в условии, чтобы не отобрать позицию у процесса,
      // который как раз в эту секунду о себе напомнил.
      const claimed = await this.prisma.musicIngestItem.updateMany({
        where: {
          id: item.id,
          status: 'fetching',
          updatedAt: { lte: item.updatedAt },
        },
        data: { status: 'waiting' },
      });
      revived += claimed.count;
    }

    if (revived > 0) {
      this.logger.log(`Возвращено в очередь зависших позиций: ${revived}`);
    }
    return revived;
  }

  /**
   * Взять позицию себе. `updateMany` с проверкой статуса — тот же приём, что
   * в остальном воркере: два процесса не возьмутся за одну строку.
   */
  private async claim(id: string) {
    const claimed = await this.prisma.musicIngestItem.updateMany({
      where: { id, status: 'waiting' },
      data: { status: 'fetching', attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return null;

    return this.prisma.musicIngestItem.findUnique({
      where: { id },
      include: { batch: true },
    });
  }

  private async processItem(
    item: NonNullable<Awaited<ReturnType<MusicIngestProcessService['claim']>>>,
  ): Promise<void> {
    if (item.source !== 'upload') {
      // Доставку по ссылке делает задача 8, распаковку архива — задача 10.
      // До них позиция честно падает: молчаливая заглушка в очереди хуже
      // отказа словами, потому что её никто не заметит.
      await this.finishFailed(item.id, PENDING_SOURCE_REASON[item.source]);
      return;
    }
    if (!item.storageKey) {
      await this.recordFailure(item, 'У позиции нет файла в хранилище');
      return;
    }

    const object = await this.storage.head(item.storageKey);
    if (!object) {
      // Ссылку выдали, а файл не долили: заливку могли оборвать, и следующая
      // попытка застанет объект на месте.
      await this.recordFailure(item, 'Файл ещё не загружен в хранилище');
      return;
    }

    const mime = mimeFromStorageKey(item.storageKey);
    if (!mime) {
      await this.finishFailed(
        item.id,
        MUSIC_UPLOAD_REJECTION_TEXT.mime_not_accepted,
      );
      return;
    }

    const prefix = await this.storage.readPrefix(item.storageKey);
    const raw = prefix
      ? await this.metadata.read(prefix, mime, object.sizeBytes)
      : null;
    const metadata = normalizeAudioMetadata(raw);
    const embeddedCover = extractEmbeddedCover(raw, MUSIC_COVER_MAX_BYTES);

    /**
     * Длительность считаем сами, когда прочитан не весь файл: пакет
     * возвращает длительность **префикса**, а не записи, и делает это молча.
     */
    const durationSeconds = resolveDurationSeconds({
      parsedSeconds: metadata.durationSeconds,
      bitrateKbps: metadata.bitrateKbps,
      sizeBytes: object.sizeBytes,
      tagBytes: prefix ? readId3v2Size(prefix) : 0,
      readBytes: prefix ? prefix.length : 0,
    });

    const duplicateOfTrackId = object.etag
      ? await this.findDuplicate(object.etag, item.id)
      : null;
    if (duplicateOfTrackId) {
      await this.prisma.musicIngestItem.update({
        where: { id: item.id },
        data: {
          status: 'skipped',
          duplicateOfTrackId,
          checksum: object.etag,
          failureReason: 'Уже есть в каталоге',
        },
      });
      // Объект убираем: место он занимает, а нужен уже никому — запись, на
      // которую он похож, в каталоге и так есть.
      await this.storage.remove(item.storageKey);
      return;
    }

    const rejection = validateMusicUploadCompletion(
      {
        sizeBytes: object.sizeBytes,
        durationSeconds,
        bitrateKbps: metadata.bitrateKbps,
        // Дубль разобран выше, отдельным исходом: у позиции это `skipped` с
        // ссылкой на найденное, а не отказ.
        duplicate: false,
      },
      this.limits,
    );
    if (rejection) {
      // Приговор, а не сбой: повторять нечего, файл от этого не изменится.
      // Объект остаётся в бакете до уборки партии — админ ещё может забрать
      // его или посмотреть, что именно залил.
      await this.finishFailed(item.id, MUSIC_UPLOAD_REJECTION_TEXT[rejection]);
      return;
    }

    const coverKey = embeddedCover
      ? await this.storeEmbeddedCover(item.batchId, embeddedCover)
      : null;

    await this.prisma.$transaction(async (tx) => {
      const track = await tx.musicTrack.create({
        data: {
          // Тег, иначе имя файла: пустая карточка в таблице хуже неточного
          // названия — админ правит его руками, но искать безымянное нечем.
          title: fallbackTrackTitle(metadata, item.sourceRef),
          storageKey: item.storageKey!,
          mime,
          sizeBytes: object.sizeBytes,
          durationSeconds: durationSeconds!,
          bitrateKbps: metadata.bitrateKbps,
          // Значения партии сильнее тега: их админ выставил осознанно, а тег
          // пришёл из чужого архива.
          language: item.batch.language ?? metadata.language,
          artistId: item.batch.artistId,
          albumId: item.batch.albumId,
          isLiveRecording: item.batch.isLiveRecording,
          // Черновик, а не публикация: партия выходит в каталог целиком и
          // только по кнопке, после того как админ прошёл таблицу глазами.
          status: 'draft',
          // Запись портальная: у неё нет автора, которому что-то вернут по
          // жалобе, и в чужую квоту она не считается.
          uploadedById: null,
          ...(coverKey ? { coverKey } : {}),
        },
      });

      if (item.batch.categoryIds.length > 0) {
        await tx.musicTrackCategory.createMany({
          data: item.batch.categoryIds.map((categoryId) => ({
            trackId: track.id,
            categoryId,
          })),
          // Категорию могли удалить из справочника, пока партия качалась.
          skipDuplicates: true,
        });
      }

      await tx.musicIngestItem.update({
        where: { id: item.id },
        data: {
          status: 'stored',
          trackId: track.id,
          checksum: object.etag,
          failureReason: null,
        },
      });
    });
  }

  /**
   * Есть ли уже такая запись. Смотрим оба пути, которыми файл попадает в
   * каталог: редакционные позиции и личные загрузки — иначе киртан,
   * принесённый человеком неделю назад, приедет вторым экземпляром.
   */
  private async findDuplicate(
    checksum: string,
    selfItemId: string,
  ): Promise<string | null> {
    const viaIngest = await this.prisma.musicTrack.findFirst({
      where: { ingestItem: { checksum, NOT: { id: selfItemId } } },
      select: { id: true },
    });
    if (viaIngest) return viaIngest.id;

    // У личной загрузки контрольная сумма живёт на ней, а не на записи:
    // связывает их ключ объекта, он же уникален у трека.
    const upload = await this.prisma.musicUpload.findFirst({
      where: { checksum, status: 'completed' },
      select: { storageKey: true },
    });
    if (!upload) return null;

    const track = await this.prisma.musicTrack.findFirst({
      where: { storageKey: upload.storageKey },
      select: { id: true },
    });
    return track?.id ?? null;
  }

  /**
   * Обложка из тегов — в тот же путь, что и загруженная руками, только
   * владелец в нём партия: у портальной записи человека-владельца нет, а
   * ключ обязан оставаться разбираемым.
   *
   * Не удалось — `null` и молчание: обложка украшает карточку, но ронять
   * из-за неё принятую запись нельзя.
   */
  private async storeEmbeddedCover(
    batchId: string,
    cover: EmbeddedCover,
  ): Promise<string | null> {
    const key = buildMusicCoverKey(
      'track',
      batchId,
      coverExtensionFor(cover.mime),
      randomUUID(),
    );
    const stored = await this.storage.put(key, cover.data, cover.mime);
    return stored ? key : null;
  }

  /** Сбой, который может пройти со следующей попытки. */
  private async recordFailure(
    item: { id: string; attempts: number },
    reason: string,
  ): Promise<void> {
    const next = nextStateAfterFailure(item.attempts, reason);
    await this.prisma.musicIngestItem.update({
      where: { id: item.id },
      data: { status: next.status, failureReason: next.failureReason },
    });
  }

  /** Отказ по существу: повторять нечего. */
  private async finishFailed(id: string, reason: string): Promise<void> {
    await this.prisma.musicIngestItem.update({
      where: { id },
      data: { status: 'failed', failureReason: reason.slice(0, 200) },
    });
  }

  /**
   * Статус партии считается по её позициям. Правило то же и живёт в том же
   * `ingest-state.ts`, что и у сервиса партий: два разных ответа на вопрос
   * «партия готова?» — худшее, что здесь можно завести.
   */
  private async refreshStatus(batchId: string): Promise<void> {
    const items = await this.prisma.musicIngestItem.findMany({
      where: { batchId },
      select: { status: true },
    });
    await this.prisma.musicIngestBatch.update({
      where: { id: batchId },
      data: { status: batchStatusFor(items) },
    });
  }
}

/**
 * Источники, до которых очередь ещё не дошла. Ветку заменяет задача 8
 * (доставка по ссылке) и задача 10 (распаковка архива) — вместе с этой
 * таблицей.
 */
const PENDING_SOURCE_REASON: Record<
  Exclude<MusicIngestSource, 'upload'>,
  string
> = {
  url: 'Импорт по ссылке появится позже — пока добавьте файл вручную.',
  zip: 'Импорт архива появится позже — пока добавьте файлы вручную.',
};
