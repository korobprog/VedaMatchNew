import { MUSIC_ACCEPTED_MIME } from '@vedamatch/shared';
import type { MusicUploadRightsBasis } from '@vedamatch/shared';

/**
 * Проверка загрузки. Образец — market-listing-validate.ts.
 *
 * Отдельным чистым модулем, потому что проверять здесь есть что, а базы и
 * бакета для этого не нужно. Пределы передаются аргументом, а не читаются из
 * окружения: тест не должен зависеть от того, что записано в `.env`.
 *
 * Проверка идёт дважды. Первый раз — до выдачи подписанного PUT, по тому,
 * что заявил браузер: незачем выписывать пропуск на 700 МБ, чтобы потом
 * отказать. Второй раз — на `complete`, по фактическому объекту в бакете и
 * прочитанным с сервера тегам. Второй проверке верят, первой — нет.
 */

export interface MusicUploadLimits {
  maxBytes: number;
  maxDurationSeconds: number;
  maxBitrateKbps: number;
  /** Сколько всего байт разрешено держать одному человеку. */
  accountQuotaBytes: number;
}

export const MUSIC_UPLOAD_DEFAULT_LIMITS: MusicUploadLimits = {
  // Киртан на 40 минут в 320 kbps — около 96 МБ; 150 оставляет запас на
  // программу целиком, но не превращает бакет в файлопомойку.
  maxBytes: 150 * 1024 * 1024,
  // Четыре часа: программа с лекцией и киртаном в такое укладывается, а
  // всё, что длиннее, почти наверняка залито по ошибке.
  maxDurationSeconds: 4 * 60 * 60,
  // Держим один файл, а не варианты качества: выбор качества требует
  // транскодирования, которого в v1 нет.
  maxBitrateKbps: 320,
  accountQuotaBytes: 2 * 1024 * 1024 * 1024,
};

export type MusicUploadRejection =
  | 'mime_not_accepted'
  | 'file_too_large'
  | 'file_empty'
  | 'rights_basis_required'
  | 'quota_exceeded'
  | 'duration_too_long'
  | 'duration_unknown'
  | 'bitrate_too_high'
  | 'duplicate';

export interface MusicUploadRequestFacts {
  mime: string;
  sizeBytes: number;
  rightsBasis: MusicUploadRightsBasis | null | undefined;
  /** Сколько байт этот человек уже занимает опубликованным и ждущим. */
  usedBytes: number;
}

const ACCEPTED = new Set<string>(MUSIC_ACCEPTED_MIME);

/**
 * Проверка заявки на загрузку — до выдачи подписанного PUT.
 * `null` — можно выдавать ссылку.
 */
export function validateMusicUploadRequest(
  facts: MusicUploadRequestFacts,
  limits: MusicUploadLimits = MUSIC_UPLOAD_DEFAULT_LIMITS,
): MusicUploadRejection | null {
  // `audio/mpeg; codecs=...` браузеры присылают наравне с голым типом.
  const mime = facts.mime?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ACCEPTED.has(mime)) return 'mime_not_accepted';

  if (!Number.isFinite(facts.sizeBytes) || facts.sizeBytes <= 0) {
    return 'file_empty';
  }
  if (facts.sizeBytes > limits.maxBytes) return 'file_too_large';

  // Без основания прав кнопка загрузки неактивна, но неактивная кнопка —
  // это украшение: отвечать перед правообладателем будет портал.
  if (!facts.rightsBasis) return 'rights_basis_required';

  if (facts.usedBytes + facts.sizeBytes > limits.accountQuotaBytes) {
    return 'quota_exceeded';
  }

  return null;
}

export interface MusicUploadCompletionFacts {
  /** Фактический размер объекта в бакете, а не обещанный браузером. */
  sizeBytes: number;
  durationSeconds: number | null;
  bitrateKbps: number | null;
  /** Есть ли у этого же человека запись с такой контрольной суммой. */
  duplicate: boolean;
}

/**
 * Проверка после заливки — по объекту и прочитанным с сервера тегам.
 * `null` — можно заводить запись.
 */
export function validateMusicUploadCompletion(
  facts: MusicUploadCompletionFacts,
  limits: MusicUploadLimits = MUSIC_UPLOAD_DEFAULT_LIMITS,
): MusicUploadRejection | null {
  if (!Number.isFinite(facts.sizeBytes) || facts.sizeBytes <= 0) {
    return 'file_empty';
  }
  if (facts.sizeBytes > limits.maxBytes) return 'file_too_large';

  // Длительность обязательна: без неё не построить ни плеера, ни фильтра, а
  // молча записать ноль значит завести в каталоге вечно нулевой трек.
  if (facts.durationSeconds === null || facts.durationSeconds <= 0) {
    return 'duration_unknown';
  }
  if (facts.durationSeconds > limits.maxDurationSeconds) {
    return 'duration_too_long';
  }

  // Битрейт мог не прочитаться — это не повод отказывать: файл играет и без
  // него, а поле в каталоге просто останется пустым.
  if (facts.bitrateKbps !== null && facts.bitrateKbps > limits.maxBitrateKbps) {
    return 'bitrate_too_high';
  }

  if (facts.duplicate) return 'duplicate';

  return null;
}

/** Человеческая причина отказа. Показывается тому, кто загружает. */
export const MUSIC_UPLOAD_REJECTION_TEXT: Record<MusicUploadRejection, string> =
  {
    mime_not_accepted:
      'Принимаем mp3 и m4a. FLAC, WAV и OGG пока не играют на всех устройствах.',
    file_too_large: 'Файл слишком большой.',
    file_empty: 'Файл пустой или не догрузился.',
    rights_basis_required:
      'Отметьте, на каком основании публикуете запись: своя, с открытой программы или свободно распространяемая.',
    quota_exceeded:
      'Закончилось место. Удалите старые загрузки или напишите в поддержку.',
    duration_too_long: 'Запись слишком длинная.',
    duration_unknown:
      'Не удалось прочитать длительность. Попробуйте пересохранить файл в mp3.',
    bitrate_too_high: 'Битрейт выше допустимого — пересохраните файл.',
    duplicate: 'Такая запись у вас уже есть.',
  };
