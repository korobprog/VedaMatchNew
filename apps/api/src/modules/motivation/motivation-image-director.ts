import { MotivationVisualStyle } from '@prisma/client';

export type ImageDirectionInput = {
  meaning: string;
  category?: string | null;
  author?: string | null;
  work?: string | null;
  locator?: string | null;
  contextExcerpt?: string | null;
  profileTypes?: string[];
};

export type ImageDirection = {
  style: MotivationVisualStyle;
  prompt: string;
};

const approvedStyles = new Set<string>(Object.values(MotivationVisualStyle));

const styleInstructions: Record<MotivationVisualStyle, string> = {
  spiritual_watercolor:
    'Soft spiritual watercolor, luminous natural pigments, gentle contemplative atmosphere.',
  cinematic_nature:
    'Cinematic symbolic nature, realistic light, atmospheric depth, emotionally restrained composition.',
  indian_miniature:
    'Refined Indian miniature-inspired illustration, intricate natural details, respectful traditional palette.',
  sacred_architecture:
    'Sacred architecture in serene natural light, balanced geometry, reverent and non-sectarian mood.',
  minimal_symbolism:
    'Minimal symbolic illustration, one clear visual metaphor, generous negative space, calm palette.',
  warm_documentary:
    'Warm documentary-style human scene, candid compassion, natural light, authentic everyday setting.',
  cosmic_contemplation:
    'Cosmic contemplative illustration, subtle celestial scale, quiet wonder, no fantasy spectacle.',
  historical_editorial:
    'Restrained historical editorial illustration, period atmosphere, archival palette, no celebrity likeness.',
};

/** Переносы и двойные пробелы из базы в промпте только мешают модели. */
function condense(value: string | null | undefined, limit: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

/**
 * Кто говорит и откуда — одной фразой: «spoken by Шри Кришна in
 * «Бхагавад-гита как она есть», 9.27». Части необязательны: у ручной цитаты
 * может не быть ни книги, ни локатора.
 */
function describeSource(input: ImageDirectionInput): string {
  const author = condense(input.author, 120);
  const work = condense(input.work, 160);
  const locator = condense(input.locator, 80);
  const attribution = [
    author ? `spoken by ${author}` : '',
    work ? `in «${work}»` : '',
  ]
    .filter((part) => part.length > 0)
    .join(' ');
  return [attribution, locator].filter((part) => part.length > 0).join(', ');
}

export function selectVisualStyle(
  input: ImageDirectionInput,
): MotivationVisualStyle {
  const concepts = [
    input.meaning,
    input.category,
    // Говорящий — такой же признак традиции, как и книга: цитата Кришны без
    // указания произведения всё равно должна попасть в свой визуальный ряд.
    input.author,
    input.work,
    ...(input.profileTypes ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru-RU');

  if (
    /temple|mandir|cathedral|church|mosque|sacred architecture|храм|собор|мечет/.test(
      concepts,
    )
  )
    return MotivationVisualStyle.sacred_architecture;
  if (
    /bhagavad|gita|vedic|india|indian|upanishad|махабхарат|бхагавад|гит[аы]|инди[яй]/.test(
      concepts,
    )
  )
    return MotivationVisualStyle.indian_miniature;
  if (
    /devot|bhakti|krishna|prayer|worship|spiritual|предан|бхакти|кришн|молитв|духовн/.test(
      concepts,
    )
  )
    return MotivationVisualStyle.spiritual_watercolor;
  if (
    /forest|mountain|river|ocean|tree|nature|sunrise|лес|гор[аы]|рек[аи]|океан|природ|рассвет/.test(
      concepts,
    )
  )
    return MotivationVisualStyle.cinematic_nature;
  if (
    /famous|historical|biograph|speech|great people|великие личности|известн|историческ|биограф|речь/.test(
      concepts,
    )
  )
    return MotivationVisualStyle.historical_editorial;
  return MotivationVisualStyle.minimal_symbolism;
}

export function createImageDirection(
  input: ImageDirectionInput,
  styleOverride?: MotivationVisualStyle,
): ImageDirection {
  if (styleOverride && !approvedStyles.has(styleOverride))
    throw new Error('Visual style is not approved');
  const style = styleOverride ?? selectVisualStyle(input);
  const meaning = condense(input.meaning, 2_000);
  const source = describeSource(input);
  const context = condense(input.contextExcerpt, 600);

  const lines = [
    `Illustrate this meaning without rendering the quotation: ${meaning}`,
  ];
  // Без говорящего и книги модель видит один голый смысл и разворачивает его
  // буквально: «отдавая плоды Мне» из Бхагавад-гиты превратилось в детей с
  // яблоками. Источник и проверенный контекст возвращают сцене её мир.
  if (source) lines.push(`The passage is ${source}.`);
  if (context) lines.push(`Verified context around the passage: ${context}`);
  if (source)
    lines.push(
      'Keep the setting, the figures and the landscape inside the world of that source.',
    );
  lines.push(
    'Read figurative wording as metaphor: show what it means, not the objects it names.',
    styleInstructions[style],
    'Create a vertical 9:16 composition suitable for a mobile Story.',
    'no text, no letters, no captions, no typography, no logos, no watermarks.',
    // Запрет писался против «нарисуй Эйнштейна», но в общей формулировке он
    // выхолащивал иллюстрации к священным текстам: традиционный сюжет — не
    // портрет публичной персоны, и запрещать его вместе с ней незачем.
    'A traditional depiction of a scriptural figure or a classical episode is welcome when the source calls for it, rendered in the conventions of that tradition.',
    'Do not portray a recognizable likeness of a real living or historical person and do not imitate a photograph of a public figure.',
    'Keep the depiction respectful and non-sectarian: no mockery, no invented ritual, no stereotypes, no visual artifacts, no advertising aesthetics.',
  );

  return { style, prompt: lines.join(' ') };
}
