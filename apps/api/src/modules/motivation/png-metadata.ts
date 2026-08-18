import { crc32 } from 'node:zlib';

/**
 * Текстовые метаданные в PNG.
 *
 * sharp не даёт выставить произвольный текстовый чанк, а отметка о том, что
 * кадр сгенерирован, нужна не только на пикселях: надпись площадка может
 * обрезать при перекадрировании, а метаданные читает автоматика, которая и
 * решает, вешать ли значок «сделано ИИ».
 *
 * Берём `iTXt`, а не `tEXt`: последний хранит только Latin-1, и русская строка
 * в нём превратилась бы в мусор.
 */

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
/** Сигнатура (8) + длина (4) + тип (4) + данные IHDR (13) + CRC (4). */
const AFTER_IHDR = 8 + 4 + 4 + 13 + 4;

export function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= PNG_SIGNATURE.length &&
    buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  );
}

/** Собирает один чанк: длина, тип, данные и контрольная сумма типа с данными. */
function buildChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typed) >>> 0);
  return Buffer.concat([length, typed, checksum]);
}

/**
 * Тело `iTXt`: ключ, флаги сжатия, язык, переведённый ключ и сам текст.
 *
 * Сжатие выключено (нулевые флаги) намеренно: строка короткая, а несжатый
 * чанк читается любым просмотрщиком без исключений.
 */
function buildITxtData(keyword: string, text: string): Buffer {
  return Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0]), // конец ключа
    Buffer.from([0, 0]), // не сжато, метод сжатия не задан
    Buffer.from([0]), // язык не указан
    Buffer.from([0]), // переведённого ключа нет
    Buffer.from(text, 'utf8'),
  ]);
}

/**
 * Вставляет текстовый чанк сразу за IHDR.
 *
 * Место выбрано не случайно: по спецификации IHDR идёт первым, а текстовые
 * чанки обязаны лежать до данных изображения. Дописать их в конец нельзя —
 * часть просмотрщиков перестаёт их видеть после IDAT.
 */
export function withPngText(
  png: Buffer,
  entries: ReadonlyArray<{ keyword: string; text: string }>,
): Buffer {
  if (!isPng(png)) throw new Error('Not a PNG buffer');
  if (entries.length === 0) return png;
  const chunks = entries.map((entry) =>
    buildChunk('iTXt', buildITxtData(entry.keyword, entry.text)),
  );
  return Buffer.concat([
    png.subarray(0, AFTER_IHDR),
    ...chunks,
    png.subarray(AFTER_IHDR),
  ]);
}

/** Читает текстовые чанки обратно — нужно и тестам, и разбору жалоб. */
export function readPngText(png: Buffer): Record<string, string> {
  const found: Record<string, string> = {};
  if (!isPng(png)) return found;
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('latin1');
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'iTXt') {
      const keyEnd = data.indexOf(0);
      if (keyEnd > 0) {
        const keyword = data.subarray(0, keyEnd).toString('latin1');
        // За ключом идут два байта флагов, затем язык и переведённый ключ —
        // оба пустые, то есть два нулевых байта.
        const textStart = keyEnd + 1 + 2 + 1 + 1;
        found[keyword] = data.subarray(textStart).toString('utf8');
      }
    }
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  return found;
}
