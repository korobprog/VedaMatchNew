import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type {
  AccessTokenPayload,
  AddMusicIngestArchiveRequest,
  AddMusicIngestArchiveResponse,
  AddMusicIngestFilesRequest,
  AddMusicIngestFilesResponse,
  AddMusicIngestUrlsRequest,
  CreateMusicIngestBatchRequest,
  MusicIngestBatchDetailDto,
  MusicIngestBatchDto,
  MusicIngestItemDto,
  MusicUploadRightsBasis,
  PublishMusicIngestBatchRequest,
  UpdateMusicIngestBatchRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { planIngestPlaylist } from './ingest-playlist';
import {
  batchStatusFor,
  inFlightCount,
  ingestInFlightReason,
} from './ingest-state';
import {
  checkIngestArchive,
  INGEST_ARCHIVE_REJECTION_TEXT,
} from './ingest-zip-entry';
import { isAdmin } from './is-admin';
import { MusicIngestProcessService } from './music-ingest-process.service';
import { MusicStorageService } from './music-storage.service';
import { toMusicTrackDto } from './music-track-dto';
import {
  MUSIC_INGEST_DEFAULT_LIMITS,
  MUSIC_UPLOAD_REJECTION_TEXT,
  validateMusicIngestRequest,
  type MusicIngestLimits,
} from './music-upload-validate';

/** Чем подписываем PUT архива, когда браузер о типе промолчал. */
const ARCHIVE_MIME = 'application/zip';

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
};

const MAX_TITLE_LENGTH = 200;
const MAX_NOTE_LENGTH = 2000;
/** Имя файла или запись архива в строке таблицы — длиннее показывать негде. */
const MAX_SOURCE_REF_LENGTH = 200;
/** Адрес длиннее уже не адрес, а промах вставки из буфера. */
const MAX_URL_LENGTH = 500;
/** Язык в BCP-47: `ru`, `en`, `sa` — с запасом на региональный суффикс. */
const MAX_LANGUAGE_LENGTH = 16;

const RIGHTS_BASIS: ReadonlySet<string> = new Set<MusicUploadRightsBasis>([
  'own_recording',
  'open_program',
  'freely_distributed',
]);

/**
 * `include` карточки трека — тот же, что берёт витрина. Своей константой,
 * потому что сборка DTO общая: молчаливо недостающее поле всплыло бы в
 * таблице позиций как `undefined`, а не как ошибка типов.
 */
const TRACK_CARD_INCLUDE = {
  artist: true,
  album: { include: { artist: true } },
  categories: { include: { category: true } },
} as const;

/**
 * Партии редакционного пополнения.
 *
 * Сервис отвечает за учёт: завести партию, принять позиции, отдать
 * подписанные ссылки, опубликовать. Доставку байтов делает
 * `MusicIngestFetchService`, разбор и создание черновика —
 * `MusicIngestProcessService`: складывать всё в один класс значит получить
 * файл, который не держится в голове целиком.
 */
@Injectable()
export class MusicIngestService {
  private readonly logger = new Logger(MusicIngestService.name);
  private readonly limits: MusicIngestLimits;
  private readonly publicBaseUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MusicStorageService,
    /**
     * Связь односторонняя: учёт зовёт обработку, обработка про учёт не
     * знает и ходит в базу сама. Поэтому обычная инъекция, без `forwardRef`
     * и без «пинка», вынесенного в контроллер.
     */
    private readonly process: MusicIngestProcessService,
    config: ConfigService,
  ) {
    const quota = Number(config.get<string>('MUSIC_INGEST_BATCH_QUOTA_BYTES'));
    this.limits = {
      ...MUSIC_INGEST_DEFAULT_LIMITS,
      batchQuotaBytes:
        Number.isFinite(quota) && quota > 0
          ? quota
          : MUSIC_INGEST_DEFAULT_LIMITS.batchQuotaBytes,
    };
    // Обложки лежат открыто и раздаются напрямую — в отличие от аудио.
    this.publicBaseUrl = config.get<string>('S3_PUBLIC_URL') || undefined;
  }

  /** 403 отдаёт guard прав, а не «не найдено»: раздел существует. */
  private assertAdmin(user: AccessTokenPayload): void {
    if (!isAdmin(user)) throw new ForbiddenException('Недостаточно прав');
  }

  async list(user: AccessTokenPayload): Promise<MusicIngestBatchDto[]> {
    this.assertAdmin(user);

    const batches = await this.prisma.musicIngestBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        createdBy: { select: { name: true } },
        items: { select: { status: true } },
      },
    });
    if (batches.length === 0) return [];

    // Объём всех показанных партий одним запросом: байты живут у трека, и
    // агрегат на каждую строку списка означал бы сотню запросов ради одной
    // колонки.
    const tracks = await this.prisma.musicTrack.findMany({
      where: { ingestItem: { batchId: { in: batches.map((row) => row.id) } } },
      select: { sizeBytes: true, ingestItem: { select: { batchId: true } } },
    });
    const bytesByBatch = new Map<string, number>();
    for (const track of tracks) {
      const batchId = track.ingestItem?.batchId;
      if (!batchId) continue;
      bytesByBatch.set(
        batchId,
        (bytesByBatch.get(batchId) ?? 0) + track.sizeBytes,
      );
    }

    return batches.map((batch) =>
      this.toBatchDto(batch, batch.items, bytesByBatch.get(batch.id) ?? 0),
    );
  }

  async create(
    user: AccessTokenPayload,
    body: CreateMusicIngestBatchRequest,
  ): Promise<MusicIngestBatchDto> {
    this.assertAdmin(user);

    const title = (body?.title ?? '').trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) throw new BadRequestException('Название партии обязательно');
    // Основание прав спрашивается один раз на партию, а не у каждой позиции:
    // отвечать по претензии всё равно придётся за всю пачку разом.
    if (!body?.rightsBasis || !RIGHTS_BASIS.has(body.rightsBasis)) {
      throw new BadRequestException('Укажите основание прав редакции');
    }

    const batch = await this.prisma.musicIngestBatch.create({
      data: {
        title,
        rightsBasis: body.rightsBasis,
        rightsNote: this.text(body.rightsNote, MAX_NOTE_LENGTH),
        createdById: user.sub,
        status: 'draft',
      },
      include: { createdBy: { select: { name: true } } },
    });

    return this.toBatchDto(batch, [], 0);
  }

  async detail(
    user: AccessTokenPayload,
    batchId: string,
  ): Promise<MusicIngestBatchDetailDto> {
    this.assertAdmin(user);

    const batch = await this.prisma.musicIngestBatch.findUnique({
      where: { id: batchId },
      include: {
        createdBy: { select: { name: true } },
        items: {
          orderBy: { position: 'asc' },
          include: { track: { include: TRACK_CARD_INCLUDE } },
        },
      },
    });
    if (!batch) throw new NotFoundException('Партия не найдена');

    return {
      ...this.toBatchDto(
        batch,
        batch.items,
        await this.batchUsedBytes(batchId),
      ),
      rightsBasis: batch.rightsBasis,
      rightsNote: batch.rightsNote,
      artistId: batch.artistId,
      albumId: batch.albumId,
      categoryIds: batch.categoryIds,
      language: batch.language,
      isLiveRecording: batch.isLiveRecording,
      quotaBytes: this.limits.batchQuotaBytes,
      items: batch.items.map((item) => this.toItemDto(item)),
    };
  }

  async update(
    user: AccessTokenPayload,
    batchId: string,
    body: UpdateMusicIngestBatchRequest,
  ): Promise<MusicIngestBatchDetailDto> {
    this.assertAdmin(user);
    await this.requireOpenBatch(batchId);

    const data: Prisma.MusicIngestBatchUpdateInput = {};
    if (body?.title !== undefined) {
      const title = body.title.trim().slice(0, MAX_TITLE_LENGTH);
      if (!title) throw new BadRequestException('Название партии обязательно');
      data.title = title;
    }
    if (body?.rightsBasis !== undefined) {
      if (!RIGHTS_BASIS.has(body.rightsBasis)) {
        throw new BadRequestException('Неизвестное основание прав');
      }
      data.rightsBasis = body.rightsBasis;
    }
    if (body?.rightsNote !== undefined) {
      data.rightsNote = this.text(body.rightsNote, MAX_NOTE_LENGTH);
    }
    if (body?.artistId !== undefined) {
      data.artist = body.artistId
        ? { connect: { id: body.artistId } }
        : { disconnect: true };
    }
    if (body?.albumId !== undefined) {
      data.album = body.albumId
        ? { connect: { id: body.albumId } }
        : { disconnect: true };
    }
    if (body?.categoryIds !== undefined) {
      data.categoryIds = await this.knownCategoryIds(body.categoryIds);
    }
    if (body?.language !== undefined) {
      data.language = this.text(body.language, MAX_LANGUAGE_LENGTH);
    }
    if (body?.isLiveRecording !== undefined) {
      data.isLiveRecording = Boolean(body.isLiveRecording);
    }

    await this.prisma.musicIngestBatch.update({ where: { id: batchId }, data });
    return this.detail(user, batchId);
  }

  /**
   * Удалить партию целиком. Опубликованные записи остаются: они уже часть
   * общего каталога, и партия для них — всего лишь способ, каким они туда
   * попали.
   */
  async remove(
    user: AccessTokenPayload,
    batchId: string,
  ): Promise<{ ok: true }> {
    this.assertAdmin(user);

    const batch = await this.prisma.musicIngestBatch.findUnique({
      where: { id: batchId },
      include: {
        items: {
          select: {
            storageKey: true,
            track: { select: { id: true, status: true, storageKey: true } },
          },
        },
      },
    });
    if (!batch) throw new NotFoundException('Партия не найдена');

    const draftTrackIds: string[] = [];
    const keys = new Set<string>();
    for (const item of batch.items) {
      if (item.track?.status === 'published') continue;
      if (item.track) draftTrackIds.push(item.track.id);
      if (item.storageKey) keys.add(item.storageKey);
      if (item.track?.storageKey) keys.add(item.track.storageKey);
    }

    await this.prisma.$transaction(async (tx) => {
      if (draftTrackIds.length > 0) {
        await tx.musicTrackCategory.deleteMany({
          where: { trackId: { in: draftTrackIds } },
        });
        await tx.musicTrack.deleteMany({
          where: { id: { in: draftTrackIds } },
        });
      }
      // Позиции уходят каскадом вместе с партией.
      await tx.musicIngestBatch.delete({ where: { id: batchId } });
    });

    // Файлы убираем после базы: осиротевшая строка хуже осиротевшего объекта —
    // объект найдёт чистка, а строка будет вечно ссылаться в пустоту.
    for (const key of keys) await this.storage.remove(key);

    return { ok: true };
  }

  /** Убрать одну позицию вместе с её файлом и черновиком. */
  async removeItem(
    user: AccessTokenPayload,
    batchId: string,
    itemId: string,
  ): Promise<{ ok: true }> {
    this.assertAdmin(user);
    await this.requireOpenBatch(batchId);

    const item = await this.prisma.musicIngestItem.findFirst({
      where: { id: itemId, batchId },
      select: {
        id: true,
        storageKey: true,
        track: { select: { id: true, status: true, storageKey: true } },
      },
    });
    if (!item) throw new NotFoundException('Позиция не найдена');

    // Опубликованную запись позиция за собой не уносит: она уже в каталоге.
    const draft =
      item.track && item.track.status !== 'published' ? item.track : null;
    const keys = new Set<string>();
    if (!item.track || draft) {
      if (item.storageKey) keys.add(item.storageKey);
      if (draft?.storageKey) keys.add(draft.storageKey);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.musicIngestItem.delete({ where: { id: item.id } });
      if (draft) {
        await tx.musicTrackCategory.deleteMany({
          where: { trackId: draft.id },
        });
        await tx.musicTrack.delete({ where: { id: draft.id } });
      }
    });

    for (const key of keys) await this.storage.remove(key);
    await this.refreshStatus(batchId);

    return { ok: true };
  }

  async addFiles(
    user: AccessTokenPayload,
    batchId: string,
    body: AddMusicIngestFilesRequest,
  ): Promise<AddMusicIngestFilesResponse> {
    this.assertAdmin(user);
    if (!this.storage.configured) {
      throw new ServiceUnavailableException(
        'Хранилище не настроено — загрузка недоступна',
      );
    }
    const batch = await this.requireOpenBatch(batchId);
    let used = await this.batchUsedBytes(batchId);
    const items: AddMusicIngestFilesResponse['items'] = [];
    let position = batch.items.length;

    for (const file of body?.files ?? []) {
      const mime = file.mime?.split(';')[0]?.trim().toLowerCase() ?? '';
      const rejection = validateMusicIngestRequest(
        { mime, sizeBytes: file.sizeBytes, batchUsedBytes: used },
        this.limits,
      );
      if (rejection) {
        throw new BadRequestException(
          `${file.fileName}: ${MUSIC_UPLOAD_REJECTION_TEXT[rejection]}`,
        );
      }

      const key = this.storage.buildIngestKey(
        batchId,
        EXTENSION_BY_MIME[mime] ?? 'mp3',
      );
      const url = await this.storage.presignPut(key, mime, file.sizeBytes);
      if (!url) {
        throw new ServiceUnavailableException(
          'Не удалось подготовить загрузку',
        );
      }

      const item = await this.prisma.musicIngestItem.create({
        data: {
          batchId,
          source: 'upload',
          sourceRef: file.fileName.slice(0, MAX_SOURCE_REF_LENGTH),
          position: position++,
          status: 'waiting',
          storageKey: key,
        },
      });
      used += file.sizeBytes;
      items.push({
        itemId: item.id,
        url,
        // Ровно те заголовки, что вошли в подпись: разойдутся — S3 ответит
        // 403, и разбираться в этом по логам браузера крайне неприятно.
        headers: {
          'Content-Type': mime,
          'Content-Length': String(file.sizeBytes),
        },
      });
    }

    await this.refreshStatus(batchId);
    return { items };
  }

  /**
   * Браузер сообщил, что файл залит.
   *
   * Позиция и так заведена в `waiting`, но счётчик попыток и причина отказа
   * сбрасываются: тем же движением файл переливают после обрыва, не трогая
   * остальные позиции партии.
   */
  async completeFile(
    user: AccessTokenPayload,
    batchId: string,
    itemId: string,
  ): Promise<{ ok: true }> {
    this.assertAdmin(user);
    const batch = await this.requireOpenBatch(batchId);

    const item = batch.items.find((row) => row.id === itemId);
    if (!item) throw new NotFoundException('Позиция не найдена');
    // Архив льётся тем же подписанным PUT, что и одиночная запись, и
    // сообщать о нём браузер обязан так же. Отсекается только `url`: за него
    // в бакет ходит сервер, и «я залил» от браузера там означало бы ошибку.
    if (item.source === 'url') {
      throw new BadRequestException('Эту позицию доставляет сервер');
    }

    await this.prisma.musicIngestItem.updateMany({
      // `fetching` не трогаем: позицию уже взял воркер, и сброс счётчика
      // посреди обработки означал бы вторую попытку поверх идущей.
      where: { id: itemId, batchId, status: { in: ['waiting', 'failed'] } },
      data: { status: 'waiting', attempts: 0, failureReason: null },
    });
    await this.refreshStatus(batchId);
    this.kick();

    return { ok: true };
  }

  /**
   * Запустить обработку партии.
   *
   * Возвращает в очередь всё, что осталось ждать или упало, и сразу дёргает
   * стадию. Без этой кнопки партия, собранная и брошенная до перезапуска
   * API, оживает только следующим тиком, а админ в это время смотрит на
   * таблицу, где ничего не происходит.
   */
  async start(
    user: AccessTokenPayload,
    batchId: string,
  ): Promise<{ queued: number }> {
    this.assertAdmin(user);
    await this.requireOpenBatch(batchId);

    const queued = await this.prisma.musicIngestItem.updateMany({
      // `fetching` не трогаем: позиция уже в работе, и сброс счётчика
      // посреди обработки означал бы вторую попытку поверх идущей.
      where: { batchId, status: { in: ['waiting', 'failed'] } },
      data: { status: 'waiting', attempts: 0, failureReason: null },
    });
    await this.refreshStatus(batchId);
    this.kick();

    return { queued: queued.count };
  }

  /**
   * Архив в партию.
   *
   * Принимается тем же подписанным PUT, что и обычные файлы, а не ссылкой:
   * архив у редакции обычно лежит на диске, и гнать четыре гигабайта через
   * API ради того, чтобы он оттуда пошёл в бакет, незачем — браузер кладёт
   * его туда напрямую, как и одиночные записи. Разбор сервер делает потом,
   * читая объект из бакета потоком.
   *
   * Позиция заводится сразу и в `waiting`: она контейнер, и после разбора
   * станет `skipped` с пометкой «архив разобран». Пока браузер льёт,
   * обработка будет находить её объект отсутствующим и честно ждать.
   */
  async addArchive(
    user: AccessTokenPayload,
    batchId: string,
    body: AddMusicIngestArchiveRequest,
  ): Promise<AddMusicIngestArchiveResponse> {
    this.assertAdmin(user);
    if (!this.storage.configured) {
      throw new ServiceUnavailableException(
        'Хранилище не настроено — загрузка недоступна',
      );
    }
    const batch = await this.requireOpenBatch(batchId);

    const fileName = (body?.fileName ?? '').trim();
    const rejection = checkIngestArchive({
      fileName,
      sizeBytes: body?.sizeBytes,
    });
    if (rejection) {
      throw new BadRequestException(INGEST_ARCHIVE_REJECTION_TEXT[rejection]);
    }

    // Тип берём тот, что назвал браузер: он же уйдёт в подпись и в заголовок
    // заливки. Windows зовёт zip `application/x-zip-compressed`, и требовать
    // одну строку значило бы отказывать половине редакции.
    const mime =
      body?.mime?.split(';')[0]?.trim().toLowerCase() || ARCHIVE_MIME;
    const key = this.storage.buildIngestKey(batchId, 'zip');
    const url = await this.storage.presignPut(key, mime, body.sizeBytes);
    if (!url) {
      throw new ServiceUnavailableException('Не удалось подготовить загрузку');
    }

    const item = await this.prisma.musicIngestItem.create({
      data: {
        batchId,
        source: 'zip',
        sourceRef: fileName.slice(0, MAX_SOURCE_REF_LENGTH),
        position: batch.items.length,
        status: 'waiting',
        storageKey: key,
      },
    });
    await this.refreshStatus(batchId);

    return {
      itemId: item.id,
      url,
      // Ровно те заголовки, что вошли в подпись: разойдутся — S3 ответит
      // 403, и разбираться в этом по логам браузера крайне неприятно.
      headers: {
        'Content-Type': mime,
        'Content-Length': String(body.sizeBytes),
      },
    };
  }

  /**
   * Позиции по списку адресов. Пустые строки и повторы внутри партии
   * отбрасываются молча: список приходит вставкой из буфера, и падать на
   * лишнем переводе строки нельзя.
   */
  async addUrls(
    user: AccessTokenPayload,
    batchId: string,
    body: AddMusicIngestUrlsRequest,
  ): Promise<{ added: number }> {
    this.assertAdmin(user);
    const batch = await this.requireOpenBatch(batchId);

    const seen = new Set(
      batch.items
        .filter((item) => item.source === 'url')
        .map((item) => item.sourceRef),
    );
    let position = batch.items.length;
    const rows: Prisma.MusicIngestItemCreateManyInput[] = [];

    for (const raw of body?.urls ?? []) {
      const url = (raw ?? '').trim().slice(0, MAX_URL_LENGTH);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      rows.push({
        batchId,
        source: 'url',
        sourceRef: url,
        position: position++,
        status: 'waiting',
      });
    }

    if (rows.length === 0) {
      throw new BadRequestException('Ни одного нового адреса в списке');
    }

    await this.prisma.musicIngestItem.createMany({ data: rows });
    await this.refreshStatus(batchId);
    this.kick();

    return { added: rows.length };
  }

  /**
   * Повторить упавшие. Только их: в перенесённом архиве часть ссылок протухла
   * всегда, и механизм, требующий идеального входа, не доживёт до второй
   * партии.
   */
  async retryFailed(
    user: AccessTokenPayload,
    batchId: string,
  ): Promise<{ retried: number }> {
    this.assertAdmin(user);
    await this.requireOpenBatch(batchId);

    const claimed = await this.prisma.musicIngestItem.updateMany({
      where: { batchId, status: 'failed' },
      data: { status: 'waiting', attempts: 0, failureReason: null },
    });
    await this.refreshStatus(batchId);

    return { retried: claimed.count };
  }

  /**
   * Публикация партии: черновики уходят в общий каталог.
   *
   * Пропущенные и упавшие позиции публикации не мешают — партия не обязана
   * сойтись целиком, чтобы сорок скачавшихся записей появились в каталоге.
   * А вот ждущие и качающиеся мешают: они ещё станут записями, и публикация
   * поверх них закрыла бы партию до того, как им нашлось место в каталоге.
   *
   * Непустое название собирает из партии системную подборку — в той же
   * транзакции, чтобы на витрине не осталось подборки без записей или
   * записей без подборки, если что-то упадёт на полпути.
   */
  async publish(
    user: AccessTokenPayload,
    batchId: string,
    body: PublishMusicIngestBatchRequest,
  ): Promise<{ published: number; playlistId: string | null }> {
    this.assertAdmin(user);
    const batch = await this.requireOpenBatch(batchId);

    // Публикация партии, в которой ещё идёт приём, — ловушка: остаток
    // доедет, но опубликовать его будет уже нельзя, партия закрыта. Кнопка
    // на вебе в это время неактивна, но отказ обязан жить и здесь: у ручки
    // есть и другие вызывающие, кроме одной формы.
    const inFlight = inFlightCount(batch.items);
    if (inFlight > 0) {
      throw new BadRequestException(ingestInFlightReason(inFlight));
    }

    const trackIds = batch.items
      .filter((item) => item.status === 'stored' && item.trackId)
      .map((item) => item.trackId!);
    if (trackIds.length === 0) {
      throw new BadRequestException(
        'В партии нет ни одной доставленной записи',
      );
    }

    const plan = planIngestPlaylist(body?.playlistTitle, trackIds);
    const publishedAt = new Date();
    let playlistId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      // `status: 'draft'` в условии — не украшение: запись могли опубликовать
      // или снять руками из карточки, пока партия ждала кнопки.
      await tx.musicTrack.updateMany({
        where: { id: { in: trackIds }, status: 'draft' },
        data: { status: 'published', publishedAt },
      });

      if (plan) {
        // В той же транзакции, что и публикация: подборка из черновиков — это
        // пустая карточка на витрине, а публикация без подборки — сорок записей,
        // которые придётся собирать руками.
        const playlist = await tx.musicPlaylist.create({
          data: {
            // Владелец — публикующий админ, связь `SetNull`: его уход
            // общую подборку не унесёт.
            ownerId: user.sub,
            title: plan.title,
            // Подборка портала: видна всем и без отдельного переключателя
            // видимости — те же два поля, что у `createSystemPlaylist`.
            visibility: 'public',
            isSystem: true,
            // Счётчик денормализован, и витрина берёт подборки с `trackCount > 0`:
            // не заполнив его здесь, мы бы собрали подборку, которой нигде не видно.
            trackCount: plan.items.length,
            items: { create: plan.items },
          },
          select: { id: true },
        });
        playlistId = playlist.id;
      }

      await tx.musicIngestBatch.update({
        where: { id: batchId },
        data: { status: 'published' },
      });
    });

    return { published: trackIds.length, playlistId };
  }

  /**
   * Партия, в которую ещё можно добавлять. Опубликованную не трогаем: её
   * записи уже в каталоге, и дозаливка в неё означала бы вторую публикацию
   * задним числом.
   */
  private async requireOpenBatch(batchId: string) {
    const batch = await this.prisma.musicIngestBatch.findUnique({
      where: { id: batchId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!batch) throw new NotFoundException('Партия не найдена');
    if (batch.status === 'published') {
      throw new BadRequestException('Партия уже опубликована');
    }
    return batch;
  }

  /**
   * Дёрнуть стадию приёма, не дожидаясь тика.
   *
   * Без `await`: ответ админу не должен ждать, пока прочитается первый файл.
   * Ошибку глушим логом — очередь всё равно доберёт позицию следующим тиком,
   * а упавший «пинок» не повод отвечать отказом на удавшийся запрос.
   */
  private kick(): void {
    void this.process.processOnce().catch((error) => {
      this.logger.warn(`Стадия приёма не запустилась: ${String(error)}`);
    });
  }

  /** Байты партии. Своего размера у позиции нет — он живёт у трека. */
  private async batchUsedBytes(batchId: string): Promise<number> {
    const used = await this.prisma.musicTrack.aggregate({
      where: { ingestItem: { batchId } },
      _sum: { sizeBytes: true },
    });
    return used._sum.sizeBytes ?? 0;
  }

  /**
   * Статус партии считается по её позициям, а не выставляется руками.
   *
   * Текущий статус читается тем же запросом и уходит в `batchStatusFor`: там
   * живёт правило «`published` поглощает», и без него опубликованная партия
   * открывалась бы заново от любого движения в её позициях.
   */
  private async refreshStatus(batchId: string): Promise<void> {
    const batch = await this.prisma.musicIngestBatch.findUnique({
      where: { id: batchId },
      select: { status: true, items: { select: { status: true } } },
    });
    if (!batch) return;
    await this.prisma.musicIngestBatch.update({
      where: { id: batchId },
      data: { status: batchStatusFor(batch.items, batch.status) },
    });
  }

  /**
   * Только существующие категории. Неизвестные отбрасываются, а не роняют
   * запрос: справочником владеет соседний раздел админки, и категорию могли
   * удалить, пока партия была открыта во второй вкладке.
   */
  private async knownCategoryIds(ids: string[]): Promise<string[]> {
    const wanted = [...new Set(ids ?? [])].filter(Boolean);
    if (wanted.length === 0) return [];
    const rows = await this.prisma.musicCategory.findMany({
      where: { id: { in: wanted } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private text(value: string | null | undefined, max: number): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim().slice(0, max);
    return trimmed === '' ? null : trimmed;
  }

  private toBatchDto(
    batch: {
      id: string;
      title: string;
      status: MusicIngestBatchDto['status'];
      createdBy?: { name: string } | null;
      createdAt: Date;
    },
    items: readonly { status: MusicIngestItemDto['status'] }[],
    sizeBytes: number,
  ): MusicIngestBatchDto {
    return {
      id: batch.id,
      title: batch.title,
      status: batch.status,
      itemCount: items.length,
      storedCount: items.filter((item) => item.status === 'stored').length,
      failedCount: items.filter((item) => item.status === 'failed').length,
      sizeBytes,
      // Мирское имя, а не духовное: раздел админский, как очередь и жалобы.
      createdByName: batch.createdBy?.name ?? null,
      createdAt: batch.createdAt.toISOString(),
    };
  }

  private toItemDto(item: {
    id: string;
    source: MusicIngestItemDto['source'];
    sourceRef: string;
    position: number;
    status: MusicIngestItemDto['status'];
    failureReason: string | null;
    duplicateOfTrackId: string | null;
    track: Parameters<typeof toMusicTrackDto>[0] | null;
  }): MusicIngestItemDto {
    return {
      id: item.id,
      source: item.source,
      sourceRef: item.sourceRef,
      position: item.position,
      status: item.status,
      failureReason: item.failureReason,
      track: item.track
        ? toMusicTrackDto(item.track, this.publicBaseUrl)
        : null,
      duplicateOfTrackId: item.duplicateOfTrackId,
    };
  }
}
