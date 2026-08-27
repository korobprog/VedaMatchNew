import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CompleteMusicUploadResponse,
  CreateMusicUploadRequest,
  CreateMusicUploadResponse,
  MusicStorageUsageDto,
  MyMusicUploadsDto,
} from '@vedamatch/shared';
import { MUSIC_ACCEPTED_MIME } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MusicStorageService } from './music-storage.service';
import {
  MUSIC_UPLOAD_DEFAULT_LIMITS,
  MUSIC_UPLOAD_REJECTION_TEXT,
  validateMusicUploadCompletion,
  validateMusicUploadRequest,
} from './music-upload-validate';
import type { MusicUploadLimits } from './music-upload-validate';
import {
  fallbackTrackTitle,
  normalizeAudioMetadata,
} from './music-metadata-parse';
import { MusicMetadataReader } from './music-metadata-reader';
import {
  readId3v2Size,
  resolveDurationSeconds,
} from './music-duration-estimate';
import { initialStatusFor } from './music-publish-policy';

/** Расширение по типу: имя файла от браузера может быть любым. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
};

/**
 * Незавершённая загрузка живёт два часа: подписанный PUT действует час,
 * плюс час запаса на медленный канал и на то, что вкладку закрыли посреди
 * заливки.
 */
const STALE_UPLOAD_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class MusicUploadsService {
  private readonly logger = new Logger(MusicUploadsService.name);
  private readonly limits: MusicUploadLimits;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MusicStorageService,
    private readonly metadata: MusicMetadataReader,
    config: ConfigService,
  ) {
    // Пределы вынесены в окружение: потолок объёма и битрейта — вопрос
    // денег за S3 и трафик, а не кода, и менять их надо без перевыкладки.
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

  async usage(userId: string): Promise<MusicStorageUsageDto> {
    return {
      usedBytes: await this.usedBytes(userId),
      quotaBytes: this.limits.accountQuotaBytes,
      maxUploadBytes: this.limits.maxBytes,
      acceptedMime: [...MUSIC_ACCEPTED_MIME],
    };
  }

  /**
   * Сколько человек занимает. Считаем и записи, и незавершённые загрузки:
   * иначе квоту обходят, наоткрывав десяток заливок разом.
   */
  private async usedBytes(userId: string): Promise<number> {
    const [tracks, uploads] = await Promise.all([
      this.prisma.musicTrack.aggregate({
        where: { uploadedById: userId },
        _sum: { sizeBytes: true },
      }),
      this.prisma.musicUpload.aggregate({
        where: { uploaderId: userId, status: 'pending' },
        _sum: { sizeBytes: true },
      }),
    ]);

    return (tracks._sum.sizeBytes ?? 0) + (uploads._sum.sizeBytes ?? 0);
  }

  /**
   * Свои загрузки. Показываются все, включая отклонённые: причина отказа
   * человеку нужнее самой записи — без неё он зальёт тот же файл ещё раз.
   *
   * Опубликованные тоже видны, но снять их самому нельзя: запись уже в общем
   * каталоге, и это ответственность портала, а не того, кто её принёс.
   */
  async myUploads(userId: string): Promise<MyMusicUploadsDto> {
    const [tracks, usage] = await Promise.all([
      this.prisma.musicTrack.findMany({
        where: { uploadedById: userId },
        select: {
          id: true,
          title: true,
          status: true,
          durationSeconds: true,
          sizeBytes: true,
          moderationNote: true,
          createdAt: true,
          publishedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.usage(userId),
    ]);

    return {
      items: tracks.map((track) => ({
        trackId: track.id,
        title: track.title,
        status: track.status,
        durationSeconds: track.durationSeconds,
        sizeBytes: track.sizeBytes,
        moderationNote: track.moderationNote,
        createdAt: track.createdAt.toISOString(),
        publishedAt: track.publishedAt?.toISOString() ?? null,
        canDelete: track.status !== 'published',
      })),
      usage,
    };
  }

  /**
   * Снять свою запись. Только неопубликованную: место в квоте освобождается
   * сразу, поэтому вместе со строкой уходит и объект в бакете.
   */
  async deleteMyTrack(userId: string, trackId: string): Promise<{ ok: true }> {
    const track = await this.prisma.musicTrack.findUnique({
      where: { id: trackId },
      select: { id: true, uploadedById: true, status: true, storageKey: true },
    });

    // 404, а не 403: существование чужой записи — тоже сведения о ней.
    if (!track || track.uploadedById !== userId) {
      throw new NotFoundException('Запись не найдена');
    }
    if (track.status === 'published') {
      throw new BadRequestException(
        'Запись уже в общем каталоге — снять её может только редакция',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.musicTrackCategory.deleteMany({ where: { trackId } });
      await tx.musicUpload.deleteMany({
        where: { storageKey: track.storageKey },
      });
      await tx.musicTrack.delete({ where: { id: trackId } });
    });

    // Файл убираем после базы: осиротевшая строка хуже осиротевшего объекта —
    // объект найдёт чистка, а строка будет вечно ссылаться в пустоту.
    await this.storage.remove(track.storageKey);

    return { ok: true };
  }

  async createUpload(
    userId: string,
    body: CreateMusicUploadRequest,
  ): Promise<CreateMusicUploadResponse> {
    if (!this.storage.configured) {
      throw new ServiceUnavailableException(
        'Хранилище не настроено — загрузка временно недоступна',
      );
    }

    const mime = body.mime?.split(';')[0]?.trim().toLowerCase() ?? '';
    const rejection = validateMusicUploadRequest(
      {
        mime: body.mime,
        sizeBytes: body.sizeBytes,
        rightsBasis: body.rightsBasis,
        usedBytes: await this.usedBytes(userId),
      },
      this.limits,
    );
    if (rejection) {
      throw new BadRequestException(MUSIC_UPLOAD_REJECTION_TEXT[rejection]);
    }

    const key = this.storage.buildKey(userId, EXTENSION_BY_MIME[mime] ?? 'mp3');
    const url = await this.storage.presignPut(key, mime, body.sizeBytes);
    if (!url) {
      throw new ServiceUnavailableException('Не удалось подготовить загрузку');
    }

    const upload = await this.prisma.musicUpload.create({
      data: {
        uploaderId: userId,
        storageKey: key,
        status: 'pending',
        sizeBytes: body.sizeBytes,
        mime,
        rightsBasis: body.rightsBasis,
      },
    });

    return {
      uploadId: upload.id,
      url,
      // Ровно те заголовки, что вошли в подпись. Разойдутся — S3 ответит 403,
      // и разбираться в этом по логам браузера крайне неприятно.
      headers: {
        'Content-Type': mime,
        'Content-Length': String(body.sizeBytes),
      },
      expiresInSeconds: 3600,
    };
  }

  /**
   * Заливка закончена: сверяем объект, читаем теги и заводим запись.
   *
   * Запись появляется в `pending` — до разбора модератором её слышит только
   * автор. Обратный порядок для аудио не работает: правообладатель приходит
   * быстрее модератора.
   */
  async completeUpload(
    userId: string,
    uploadId: string,
    fileName: string | undefined,
  ): Promise<CompleteMusicUploadResponse> {
    const upload = await this.prisma.musicUpload.findUnique({
      where: { id: uploadId },
    });

    // 404, а не 403: существование чужой загрузки — тоже сведения о ней.
    if (!upload || upload.uploaderId !== userId) {
      throw new NotFoundException('Загрузка не найдена');
    }
    if (upload.status !== 'pending') {
      throw new BadRequestException('Эта загрузка уже завершена');
    }

    const object = await this.storage.head(upload.storageKey);
    if (!object) {
      await this.fail(upload.id, 'Файл не найден в хранилище');
      throw new BadRequestException('Файл не догрузился. Попробуйте ещё раз.');
    }

    const prefix = await this.storage.readPrefix(upload.storageKey);
    const metadata = normalizeAudioMetadata(
      prefix
        ? await this.metadata.read(prefix, upload.mime, object.sizeBytes)
        : null,
    );

    /**
     * Длительность считаем сами, когда прочитан не весь файл: пакет
     * возвращает длительность **префикса**, а не записи, и делает это молча.
     * Поймано на настоящей записи — в базу уходило 24 секунды вместо 154.
     */
    const durationSeconds = resolveDurationSeconds({
      parsedSeconds: metadata.durationSeconds,
      bitrateKbps: metadata.bitrateKbps,
      sizeBytes: object.sizeBytes,
      tagBytes: prefix ? readId3v2Size(prefix) : 0,
      readBytes: prefix ? prefix.length : 0,
    });

    const duplicate = object.etag
      ? Boolean(
          await this.prisma.musicUpload.findFirst({
            where: {
              uploaderId: userId,
              checksum: object.etag,
              status: 'completed',
            },
            select: { id: true },
          }),
        )
      : false;

    const rejection = validateMusicUploadCompletion(
      {
        sizeBytes: object.sizeBytes,
        durationSeconds,
        bitrateKbps: metadata.bitrateKbps,
        duplicate,
      },
      this.limits,
    );

    if (rejection) {
      // Отклонённый объект в бакете не оставляем: он занимает место и
      // считается в квоте, а нужен уже никому.
      await this.storage.remove(upload.storageKey);
      await this.fail(upload.id, rejection);
      throw new BadRequestException(MUSIC_UPLOAD_REJECTION_TEXT[rejection]);
    }

    const title = fallbackTrackTitle(metadata, fileName ?? upload.storageKey);
    const status = initialStatusFor(upload.rightsBasis);

    const track = await this.prisma.$transaction(async (tx) => {
      const created = await tx.musicTrack.create({
        data: {
          title,
          storageKey: upload.storageKey,
          mime: upload.mime,
          sizeBytes: object.sizeBytes,
          durationSeconds: durationSeconds!,
          bitrateKbps: metadata.bitrateKbps,
          language: metadata.language,
          // Исполнителя из тега в каталог не заводим: справочником владеет
          // редакция, а тег — всего лишь подсказка модератору.
          //
          // А вот статус решает основание прав: своё и свободное идут в
          // каталог сразу, чужое исполнение — через проверку.
          status,
          ...(status === 'published' ? { publishedAt: new Date() } : {}),
          uploadedById: userId,
        },
      });

      await tx.musicUpload.update({
        where: { id: upload.id },
        data: {
          status: 'completed',
          sizeBytes: object.sizeBytes,
          checksum: object.etag,
        },
      });

      return created;
    });

    return {
      trackId: track.id,
      status,
      title: track.title,
      durationSeconds: track.durationSeconds,
    };
  }

  private async fail(uploadId: string, reason: string): Promise<void> {
    await this.prisma.musicUpload.update({
      where: { id: uploadId },
      data: { status: 'failed', failureReason: reason.slice(0, 200) },
    });
  }

  /**
   * Чистка брошенных загрузок. Образец — MotivationWorkerService: клейм
   * через `updateMany` с проверкой статуса, чтобы два процесса не взялись за
   * одну строку.
   *
   * Возвращает, сколько убрано, — по этому числу видно, что стадия жива.
   */
  async cleanupStale(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_UPLOAD_MS);
    const stale = await this.prisma.musicUpload.findMany({
      where: { status: 'pending', createdAt: { lt: cutoff } },
      select: { id: true, storageKey: true },
      take: 100,
    });

    let removed = 0;
    for (const upload of stale) {
      // Клейм: если строку успел взять другой процесс, `count` будет нулём и
      // объект мы не тронем.
      const claimed = await this.prisma.musicUpload.updateMany({
        where: { id: upload.id, status: 'pending' },
        data: { status: 'expired', failureReason: 'Заливка не завершена' },
      });
      if (claimed.count === 0) continue;

      await this.storage.remove(upload.storageKey);
      removed += 1;
    }

    if (removed > 0) {
      this.logger.log(`Убрано незавершённых загрузок: ${removed}`);
    }
    return removed;
  }
}
