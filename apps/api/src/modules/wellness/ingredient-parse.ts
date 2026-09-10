/**
 * Разбор строки состава на отдельные позиции.
 *
 * Самая хрупкая часть сервиса: на упаковках пишут как придётся — вложенные
 * скобки, проценты, «Состав:» в начале, точка в конце и отдельным
 * предложением «может содержать следы орехов». Поэтому разбор живёт здесь, а
 * не внутри сервиса: его проверяют тестом на реальных этикетках.
 */

/** Позиция состава: что напечатано, что из этого вышло и в каком месте. */
export interface WellnessCompositionToken {
  /** Приведённый к сравнимому виду текст: строчные, без «ё», без хвостов. */
  text: string;
  /** Кусок этикетки как есть — его показывают человеку в причине вердикта. */
  raw: string;
  position: number;
  /** Позиция из «может содержать следы»: продукт этого не содержит наверняка. */
  mayContain: boolean;
}

const LABEL_PREFIX =
  /^\s*(состав|ингредиенты|ingredients|composition)\s*[:.\-–—]?\s*/i;

/**
 * Отсюда начинается предупреждение о следах. Всё после маркера — не состав, а
 * оговорка производителя, и вердикт по ней мягче.
 */
const MAY_CONTAIN =
  /(может содержать|могут содержать|содержит следы|следы[:\s]|may contain|contains traces|produced (?:in|on) (?:a|the) (?:facility|line))/i;

/**
 * Проценты и массовые доли: «пшеничная мука 62 %» — это про количество.
 * Границу проверяем просмотром вперёд, а не `\b`: кириллическая «г» для
 * ASCII-границы не буква, и «15,5 г» через `\b` не вычищается.
 */
const SHARE =
  /\d+(?:[.,]\d+)?\s*(?:%|мг|кг|мл|ккал|г|л|kcal|kj|mg|kg|ml|g)(?![\p{L}\p{N}])/giu;

/**
 * Кириллические буквы, которыми на упаковках пишут E-номера. «Е471» с русской
 * «Е» и «E471» с латинской выглядят одинаково, а для поиска это разные строки —
 * из-за этого добавка молча не находилась ни в одном русском составе.
 */
const CYRILLIC_LOOKALIKE: Record<string, string> = {
  а: 'a',
  в: 'b',
  с: 'c',
  е: 'e',
  к: 'k',
  м: 'm',
  о: 'o',
  р: 'p',
  т: 't',
  х: 'x',
};

/** «Е 471», «Е-471», «E472е» → «e471», «e472e». */
export function normalizeENumbers(text: string): string {
  return text.replace(
    /(^|[^\p{L}\p{N}])[еe]\s*[-–—]?\s*(\d{3,4})([a-zа-я]?)/giu,
    (_match, before: string, digits: string, suffix: string) => {
      const letter = suffix.toLowerCase();
      return `${before}e${digits}${CYRILLIC_LOOKALIKE[letter] ?? letter}`;
    },
  );
}

function normalizeToken(raw: string): string {
  return normalizeENumbers(raw)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-–—•]\s*/, '')
    .replace(/[.,;:]+$/, '')
    .trim();
}

/** Мусор, который остаётся после дробления: числа, единицы, одна буква. */
function isNoise(text: string): boolean {
  if (text.length < 2) return true;
  return /^[\d\s.,:;%-]+$/.test(text);
}

function tokenizePart(
  part: string,
  mayContain: boolean,
  out: WellnessCompositionToken[],
): void {
  // Скобки не вкладываем, а раскрываем: «масло растительное (пальмовое)» —
  // это две позиции, и обе важны для вердикта.
  const flattened = part
    .replace(SHARE, ' ')
    .replace(/[()[\]{}]/g, ',')
    .replace(/\s+и\s+(?=[а-яa-z])/gi, ',');

  for (const chunk of flattened.split(/[,;.\n\r/]+/)) {
    const raw = chunk.trim();
    if (!raw) continue;
    const text = normalizeToken(raw);
    if (isNoise(text)) continue;
    out.push({ text, raw, position: out.length, mayContain });
  }
}

export function parseComposition(input: string): WellnessCompositionToken[] {
  const source = input.replace(LABEL_PREFIX, '');
  const marker = source.match(MAY_CONTAIN);
  const tokens: WellnessCompositionToken[] = [];

  if (marker?.index === undefined) {
    tokenizePart(source, false, tokens);
    return tokens;
  }

  tokenizePart(source.slice(0, marker.index), false, tokens);
  // «Может содержать следы орехов»: слово «следы» — часть оговорки, а не
  // ингредиент, иначе оно приезжает в позицию вместе с орехами.
  const trailing = source
    .slice(marker.index + marker[0].length)
    .replace(/^\s*(следы|traces of)\s+/i, ' ');
  tokenizePart(trailing, true, tokens);
  return tokens;
}
