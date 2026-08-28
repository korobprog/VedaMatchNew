import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CreateMusicCoverUploadRequest,
  CreateMusicCoverUploadResponse,
  MusicCoverMime,
  MusicCoverScope,
} from '@vedamatch/shared';
import { MusicStorageService } from './music-storage.service';
import {
  MUSIC_COVER_REJECTION_TEXT,
  buildMusicCoverKey,
  coverExtensionFor,
  resolveMusicCoverKey,
  validateMusicCoverRequest,
} from './music-cover-validate';

/**
 * Обложки каталога и плейлистов.
 *
 * Отдельно от `MusicUploadsService`, потому что это другой объект по всем
 * признакам: обложка **публичная** и раздаётся с CDN напрямую (её ждут в
 * SSR-разметке), весит мегабайты вместо сотен, не имеет ни очереди
 * модерации, ни основания прав, ни квоты. Общее у них только подписанный PUT.
 *
 * Ключ выдаётся сразу и ничего не значит, пока его не запишут в карточку:
 * «завершения» здесь нет намеренно. Осиротевший объект на два мегабайта
 * дешевле лишней таблицы и лишней фоновой стадии.
 */

/** Подписанный PUT живёт час — как и у аудио. */
const COVER_URL_TTL_SECONDS = 3600;

@Injectable()
export class MusicCoversService {
  constructor(private readonly storage: MusicStorageService) {}

  /**
   * Ссылка на заливку обложки. Проверка — до выписки: после неё поздно,
   * байты уже в бакете.
   */
  async createUpload(
    userId: string,
    body: CreateMusicCoverUploadRequest,
  ): Promise<CreateMusicCoverUploadResponse> {
    if (!this.storage.configured) {
      throw new ServiceUnavailableException(
        'Хранилище не настроено — загрузка обложек временно недоступна',
      );
    }

    const mime = body.mime?.split(';')[0]?.trim().toLowerCase() ?? '';
    const check = validateMusicCoverRequest({
      scope: body.scope,
      mime,
      sizeBytes: body.sizeBytes,
    });
    if (!check.ok) {
      throw new BadRequestException(
        MUSIC_COVER_REJECTION_TEXT[check.rejection!],
      );
    }

    const coverKey = buildMusicCoverKey(
      body.scope,
      userId,
      coverExtensionFor(mime as MusicCoverMime),
      crypto.randomUUID(),
    );
    const url = await this.storage.presignPut(coverKey, mime, body.sizeBytes);
    if (!url) {
      throw new ServiceUnavailableException('Не удалось подготовить загрузку');
    }

    return {
      coverKey,
      url,
      // Ровно те заголовки, что вошли в подпись: разойдутся — S3 ответит 403.
      headers: {
        'Content-Type': mime,
        'Content-Length': String(body.sizeBytes),
      },
      expiresInSeconds: COVER_URL_TTL_SECONDS,
    };
  }

  /**
   * Что записать в `coverKey` карточки. `undefined` — поле не трогать.
   *
   * Зовётся из сервисов, которые правят карточки: своей проверки у них быть
   * не должно, иначе она разъедется с выдачей ключей.
   */
  resolveKey(input: {
    next: string | null | undefined;
    current: string | null;
    scope: MusicCoverScope;
    /** Обязателен только там, где карточку правит не администратор. */
    ownerId?: string;
  }): string | null | undefined {
    const result = resolveMusicCoverKey(input);
    if (!result.ok) {
      throw new BadRequestException(MUSIC_COVER_REJECTION_TEXT[result.rejection]);
    }

    return result.value;
  }

  /**
   * Убрать объект обложки. Молча — как и вся чистка: отсутствие объекта не
   * повод отказывать в правке карточки.
   */
  async remove(key: string | null): Promise<void> {
    if (!key) return;
    await this.storage.remove(key);
  }
}
