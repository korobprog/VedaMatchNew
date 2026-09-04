import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { orderIngestEntries, planIngestReorder } from './ingest-order';
import {
  INGEST_BATCH_SIZE,
  mimeFromStorageKey,
  nextStateAfterFailure,
} from './ingest-process-rules';
import { batchStatusFor, isItemStale } from './ingest-state';
import {
  IngestFetchError,
  MusicIngestFetchService,
  type ExtractedArchiveEntry,
} from './music-ingest-fetch.service';
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
  MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES,
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
  /** Потолок партии. Тот же, что показывает админке `MusicIngestService`. */
  private readonly batchQuotaBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MusicStorageService,
    private readonly metadata: MusicMetadataReader,
    private readonly fetcher: MusicIngestFetchService,
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
    this.batchQuotaBytes = num(
      'MUSIC_INGEST_BATCH_QUOTA_BYTES',
      MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES,
    );
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

  /**
   * Первый шаг, единственный, который у источников разный: довести байты до
   * бакета и назвать их факты. Дальше дорога общая.
   *
   * `null` — доставка не состоялась и причина уже записана: у неё их
   * несколько, и решение «повторять или нет» принимается здесь, где известно,
   * что именно случилось.
   */
  private async deliver(
    item: NonNullable<Awaited<ReturnType<MusicIngestProcessService['claim']>>>,
  ): Promise<DeliveredObject | null> {
    // Запись, вынутая из архива, приходит сюда с тем же признаком, что и
    // залитая браузером: объект уже в бакете, и доставлять нечего.
    if (item.source === 'upload' || item.source === 'zip') {
      if (!item.storageKey) {
        await this.recordFailure(item, 'У позиции нет файла в хранилище');
        return null;
      }

      const object = await this.storage.head(item.storageKey);
      if (!object) {
        // Ссылку выдали, а файл не долили: заливку могли оборвать, и
        // следующая попытка застанет объект на месте.
        await this.recordFailure(item, 'Файл ещё не загружен в хранилище');
        return null;
      }

      return {
        storageKey: item.storageKey,
        sizeBytes: object.sizeBytes,
        // У однокусочной заливки ETag и есть MD5 содержимого — та же сумма,
        // что загрузчик по ссылке считает сам. У записи из архива она уже
        // посчитана при распаковке, и ETag брать нельзя: у многочастной
        // заливки в нём сумма сумм частей, по которой дубли не ловятся.
        checksum: item.checksum ?? object.etag,
      };
    }

    if (item.source === 'url') {
      try {
        const fetched = await this.fetcher.fetchUrl(
          item.batchId,
          item.sourceRef,
          await this.batchRemainingBytes(item.batchId),
        );
        // Ключ пишем сразу, до разбора тегов: упади процесс на следующей
        // строке — объект останется в бакете, и убрать его сможет только
        // тот, кто знает его имя.
        await this.prisma.musicIngestItem.update({
          where: { id: item.id },
          data: { storageKey: fetched.storageKey, checksum: fetched.checksum },
        });
        return fetched;
      } catch (error) {
        if (error instanceof IngestFetchError) {
          // Приговор не повторяем: адрес и тип содержимого от второй попытки
          // не меняются, а три захода за одним и тем же ответом только
          // растягивают партию.
          if (error.retryable) await this.recordFailure(item, error.reason);
          else await this.finishFailed(item.id, error.reason);
          return null;
        }
        throw error;
      }
    }

    // Архив сюда не доходит: его разбирает `expandArchiveItem` до общей
    // дороги. Ветка остаётся ради нового источника, который заведут завтра:
    // молчаливый пропуск в очереди хуже отказа словами.
    await this.finishFailed(item.id, 'Неизвестный источник позиции');
    return null;
  }

  /**
   * Позиция-архив: разобрать и завести позиции по его записям.
   *
   * Отдельно от `deliver`, потому что исход другой по существу. У остальных
   * источников позиция становится записью каталога, а архив — контейнер: он
   * не превращается ни во что, он порождает других. Поэтому после разбора
   * он `skipped` с пометкой «архив разобран», а не `stored`.
   */
  private async expandArchiveItem(
    item: NonNullable<Awaited<ReturnType<MusicIngestProcessService['claim']>>>,
  ): Promise<void> {
    if (!item.storageKey) {
      await this.recordFailure(item, 'Архив ещё не загружен в хранилище');
      return;
    }

    let entries: ExtractedArchiveEntry[];
    try {
      entries = await this.fetcher.expandArchive(
        item.batchId,
        item.storageKey,
        await this.batchRemainingBytes(item.batchId),
      );
    } catch (error) {
      if (error instanceof IngestFetchError) {
        // Приговор не повторяем: путь наружу и переполнение потолков от
        // второй попытки не изменятся.
        if (error.retryable) await this.recordFailure(item, error.reason);
        else await this.finishFailed(item.id, error.reason);
        return;
      }
      throw error;
    }

    if (entries.length === 0) {
      await this.finishFailed(
        item.id,
        'В архиве нет ни одной записи mp3 или m4a',
      );
      return;
    }

    // Порядок на первое время — человеческий порядок имён: номера из тегов
    // ещё не прочитаны, а таблица заполняется прямо сейчас и должна выглядеть
    // альбомом, а не мешаниной.
    const ordered = orderIngestEntries(
      entries.map((entry) => ({
        ...entry,
        ref: entry.entryPath,
        trackNumber: null,
      })),
    );

    const last = await this.prisma.musicIngestItem.aggregate({
      where: { batchId: item.batchId },
      _max: { position: true },
    });
    let position = (last._max.position ?? -1) + 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.musicIngestItem.createMany({
        data: ordered.map((entry) => ({
          batchId: item.batchId,
          source: 'zip' as const,
          sourceRef: entry.entryPath.slice(0, MAX_SOURCE_REF_LENGTH),
          position: position++,
          status: 'waiting' as const,
          storageKey: entry.storageKey,
          checksum: entry.checksum,
        })),
      });
      await tx.musicIngestItem.update({
        where: { id: item.id },
        data: {
          status: 'skipped',
          failureReason: 'Архив разобран',
          // Объект убираем следом, и ключ, ведущий в пустоту, позиции не
          // нужен: по нему уборка партии полезла бы за несуществующим.
          storageKey: null,
        },
      });
    });

    // Сам архив в бакете больше не нужен: записи из него уже лежат
    // отдельными объектами, а он занимал бы место второй раз.
    await this.storage.remove(item.storageKey);
    this.logger.log(
      `Архив ${item.sourceRef} разобран: позиций заведено ${ordered.length}`,
    );
  }

  /**
   * Сколько партии ещё разрешено занять. Загрузчику это нужнее, чем
   * проверке заявки: у ссылки размер заранее не назван, и единственный
   * момент, когда партию можно остановить, — счётчик принятых байтов.
   */
  private async batchRemainingBytes(batchId: string): Promise<number> {
    const used = await this.prisma.musicTrack.aggregate({
      where: { ingestItem: { batchId } },
      _sum: { sizeBytes: true },
    });
    return Math.max(0, this.batchQuotaBytes - (used._sum.sizeBytes ?? 0));
  }

  private async processItem(
    item: NonNullable<Awaited<ReturnType<MusicIngestProcessService['claim']>>>,
  ): Promise<void> {
    // Архив идёт своей дорогой и общей не касается: он не запись каталога, а
    // контейнер, и позиции по нему заводятся, а не создаются из него.
    if (item.source === 'zip' && item.storageKey?.endsWith('.zip')) {
      await this.expandArchiveItem(item);
      return;
    }

    const delivered = await this.deliver(item);
    // Доставка сама записала причину отказа: у неё их несколько, и они
    // разные по существу — от «файл ещё не долили» до «адрес ведёт во
    // внутреннюю сеть».
    if (!delivered) return;

    const storageKey = delivered.storageKey;
    const mime = mimeFromStorageKey(storageKey);
    if (!mime) {
      await this.finishFailed(
        item.id,
        MUSIC_UPLOAD_REJECTION_TEXT.mime_not_accepted,
      );
      return;
    }

    const object = { sizeBytes: delivered.sizeBytes, etag: delivered.checksum };

    const prefix = await this.storage.readPrefix(storageKey);
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
      await this.storage.remove(storageKey);
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
          storageKey,
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
          // Номер из тегов остаётся у позиции: по нему разбор архива
          // выстраивает дорожки в порядке альбома, когда партия дочитана.
          trackNumber: metadata.trackNumber,
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
    const status = batchStatusFor(items);
    await this.prisma.musicIngestBatch.update({
      where: { id: batchId },
      data: { status },
    });

    // Порядок альбома известен только когда прочитаны все теги: пока хоть
    // одна позиция в очереди, переставлять нечего.
    if (status !== 'running') await this.reorderArchiveItems(batchId);
  }

  /**
   * Выстроить позиции, заведённые архивом, в порядке дорожек.
   *
   * Только доставленные и только из архива: у файлов и ссылок порядок задал
   * человек — тем, в каком порядке их назвал, — и переставлять его по тегам
   * значит переспорить его без спроса.
   */
  private async reorderArchiveItems(batchId: string): Promise<void> {
    const items = await this.prisma.musicIngestItem.findMany({
      where: { batchId, source: 'zip', status: 'stored' },
      select: { id: true, sourceRef: true, position: true, trackNumber: true },
      orderBy: { position: 'asc' },
    });

    const changes = planIngestReorder(
      items.map((item) => ({
        id: item.id,
        ref: item.sourceRef,
        position: item.position,
        trackNumber: item.trackNumber,
      })),
    );
    if (changes.length === 0) return;

    // Одной транзакцией: половина переставленных позиций — это порядок,
    // которого не было ни до, ни после.
    await this.prisma.$transaction(
      changes.map((change) =>
        this.prisma.musicIngestItem.update({
          where: { id: change.id },
          data: { position: change.position },
        }),
      ),
    );
  }
}

/** Имя записи архива в строке таблицы — длиннее показывать негде. */
const MAX_SOURCE_REF_LENGTH = 200;

/**
 * Факты о доставленном объекте — общий язык всех трёх источников. `checksum`
 * бывает `null`: у заливки одним PUT его отдаёт ETag, но хранилище могло
 * промолчать, и тогда позиция просто не участвует в поиске дублей.
 */
interface DeliveredObject {
  storageKey: string;
  sizeBytes: number;
  checksum: string | null;
}
