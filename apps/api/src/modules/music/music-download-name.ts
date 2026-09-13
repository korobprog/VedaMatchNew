/**
 * Имя скачанного файла и заголовок, который его задаёт (VED-107).
 *
 * В бакете запись лежит под служебным ключом `music/uploads/<user>/<uuid>.mp3`,
 * и без подсказки браузер сохранил бы файл этим uuid — в папке «Загрузки»
 * такой бхаджан потом не найти. Поэтому имя собирается из того, что человек
 * видел в каталоге: «Исполнитель — Название.mp3».
 */

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
};

/** Предел длины без расширения: Windows не любит пути длиннее 260 знаков. */
const MAX_BASE_LENGTH = 120;

export function musicDownloadFileName(input: {
  title: string;
  artistName: string | null;
  mime: string;
}): string {
  const extension = EXTENSION_BY_MIME[input.mime] ?? 'mp3';
  const raw = input.artistName?.trim()
    ? `${input.artistName.trim()} — ${input.title}`
    : input.title;

  const base =
    raw
      // Знаки, запрещённые в именах файлов Windows и macOS, и управляющие.
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      // Точка в конце имени на Windows молча отбрасывается.
      .replace(/[.\s]+$/, '')
      .slice(0, MAX_BASE_LENGTH)
      .trim() || 'Запись';

  return `${base}.${extension}`;
}

/**
 * `Content-Disposition: attachment` с именем для любого браузера.
 *
 * Кириллицу в `filename="…"` старые клиенты показывают кракозябрами, поэтому
 * имя идёт дважды: ASCII-заменой для них и `filename*` в UTF-8 (RFC 6266) —
 * современные браузеры берут второе.
 */
export function attachmentDisposition(fileName: string): string {
  const ascii =
    fileName
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, '_') || 'track';
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
