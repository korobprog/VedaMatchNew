/**
 * Что можно приложить к моменту. Отдельно от правил переписки
 * (`chat-upload-rules.ts`): у момента свои виды и свои пределы, и общий на
 * двоих список однажды разрешил бы в переписке то, что задумано для момента.
 */

export const MAX_MOMENT_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Тридцать мегабайт на ролик. Ограничение по байтам, а не по секундам, —
 * первое: длину сервер узнаёт только после загрузки, а место в памяти
 * процесса занимает уже она.
 */
export const MAX_MOMENT_VIDEO_BYTES = 30 * 1024 * 1024;

export const ALLOWED_MOMENT_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * Только два контейнера. `video/quicktime` не принимаем осознанно: .mov с
 * айфона чаще всего HEVC, и в браузере он даёт чёрный экран без единой
 * ошибки. Перекодировать нечем — честный отказ с внятным текстом лучше
 * молчаливой черноты у зрителя.
 */
export const ALLOWED_MOMENT_VIDEO_MIME = new Set(['video/mp4', 'video/webm']);

export type MomentUploadDenial = 'unsupported_type' | 'file_too_large';

export interface MomentUploadCandidate {
  mimetype: string;
  size: number;
}

export function momentUploadKindFor(
  mimetype: string,
): 'photo' | 'video' | null {
  if (ALLOWED_MOMENT_IMAGE_MIME.has(mimetype)) return 'photo';
  if (ALLOWED_MOMENT_VIDEO_MIME.has(mimetype)) return 'video';
  return null;
}

export function maxMomentBytesFor(kind: 'photo' | 'video'): number {
  return kind === 'video' ? MAX_MOMENT_VIDEO_BYTES : MAX_MOMENT_IMAGE_BYTES;
}

/** `null` — файл принимается. */
export function validateMomentUpload(
  file: MomentUploadCandidate | undefined,
): MomentUploadDenial | null {
  if (!file) return 'unsupported_type';
  const kind = momentUploadKindFor(file.mimetype);
  if (!kind) return 'unsupported_type';
  if (file.size > maxMomentBytesFor(kind)) return 'file_too_large';
  return null;
}

/** Расширение файла в бакете: ffmpeg по нему узнаёт контейнер. */
export function momentVideoExtension(mimetype: string): string {
  return mimetype === 'video/webm' ? '.webm' : '.mp4';
}
