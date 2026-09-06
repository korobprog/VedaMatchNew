/**
 * Проверка загружаемой фоновой записи.
 *
 * Отдельным модулем, как и проверка кадра: правила чистые, а ошибаться в них
 * дорого — файл едет в хранилище, откуда его потом раздают всем читателям.
 */

/** Что принимаем. Список закрытый: браузеры играют эти три везде. */
const AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
};

/**
 * Потолок размера. Фон — не альбом: десять минут спокойного инструментала в
 * mp3 укладываются в эти двадцать мегабайт с запасом, а всё, что больше,
 * читатель будет ждать вместо того, чтобы читать.
 */
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export interface UploadedAudio {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

export type AudioProblem = 'audio_missing' | 'audio_type' | 'audio_too_big';

export function validateAudio(
  file: UploadedAudio | undefined,
): AudioProblem | null {
  if (!file || !file.buffer?.length) return 'audio_missing';
  if (!AUDIO_TYPES[file.mimetype]) return 'audio_type';
  if (file.size > MAX_AUDIO_BYTES) return 'audio_too_big';
  return null;
}

/** Человеческое объяснение вместо кода: его читает администратор. */
export function audioMessage(problem: AudioProblem): string {
  if (problem === 'audio_missing') return 'Файл не выбран';
  if (problem === 'audio_type')
    return 'Нужен звуковой файл: mp3, m4a или ogg';
  return 'Файл больше 20 МБ — возьмите запись покороче или сожмите её';
}

/** Расширение для ключа в хранилище: по типу, а не по имени файла. */
export function audioExtension(mimetype: string): string {
  return AUDIO_TYPES[mimetype] ?? 'bin';
}

/**
 * Ключ в хранилище. Со временем создания: одна и та же запись, залитая
 * дважды, не должна затирать первую — вторая может оказаться хуже, и
 * вернуться будет некуда.
 */
export function audioKey(id: string, mimetype: string, now: number): string {
  return `motivation/audio/${id}-${now}.${audioExtension(mimetype)}`;
}

/**
 * Название по умолчанию — из имени файла, без расширения и служебных
 * подчёркиваний. Администратор загружает пачку и переименовывает потом; до
 * тех пор «vedic_flute_01.mp3» читается лучше, чем «Без названия».
 */
export function titleFromFilename(name: string | undefined): string {
  const base = (name ?? '').replace(/\.[a-z0-9]+$/i, '').trim();
  const cleaned = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || 'Без названия';
}
