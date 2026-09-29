/**
 * Подписи и разметка раздела стиха в читалке (VED-683) — чистые функции.
 */

/**
 * «Бхагавад-гита 2.66» → «Текст 2.66»: название книги уже в верхней панели,
 * у стиха важен номер. Заголовок без номера в конце остаётся как есть.
 */
export function unitHeading(title: string): string {
  const match = /^(.*\S)\s+(\d+(?:\.\d+)*(?:[-–]\d+)?)$/.exec(title.trim());
  return match && /\p{L}/u.test(match[1]) ? `Текст ${match[2]}` : title;
}

export interface TextSegment {
  text: string;
  bold: boolean;
}

/**
 * Пословный перевод с выделенным санскритом: в каждой паре «слово —
 * значение» до тире — санскрит. Пары разделены «;». Сегменты вместе дают
 * ровно исходный текст — смещения выделений и заметок не съезжают.
 */
export function sanskritSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const pairs = text.split(/(;\s*)/);
  for (const part of pairs) {
    const dash = part.search(/\s[—–-]\s/);
    if (dash > 0 && !/^;\s*$/.test(part)) {
      segments.push({ text: part.slice(0, dash), bold: true });
      segments.push({ text: part.slice(dash), bold: false });
    } else if (part) {
      segments.push({ text: part, bold: false });
    }
  }
  return segments;
}
