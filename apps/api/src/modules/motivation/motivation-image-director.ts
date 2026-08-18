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

  // Кинематографические стили. Описания длиннее не для красоты: модель
  // слушается операторского языка — оптики, характера света, зерна, — а на
  // одном прилагательном «кинематографично» выдаёт всё ту же иллюстрацию.
  cinematic_film:
    'Shot on 35mm film with a fast prime lens, shallow depth of field, natural film grain and gentle halation. Warm low-angle daylight, soft rim light separating the subject from the background, subtle atmospheric haze giving depth. Muted filmic colour grade, true skin and fabric texture, nothing plastic or airbrushed.',
  epic_wide:
    'Anamorphic wide shot, deep landscape, human figures small against the scale of the scene. Volumetric light through dust or mist, layered atmospheric perspective from foreground to horizon. Restrained epic grandeur, natural colour, no fantasy glow.',
  night_devotional:
    'A single warm practical light source — an oil lamp or candle flame — carving the subject out of deep shadow. High dynamic range between flame and darkness, soft falloff, visible grain in the shadows. Quiet, intimate, reverent.',
  painterly_realism:
    'Painted with the realism of classical masters: believable anatomy, weight and volume, light modelled across form, visible brushwork in the background and fine detail on the focal point. Rich but restrained palette, canvas texture, varnish depth. Realistic, yet unmistakably a painting rather than a photograph.',
};

/**
 * Чем открывается промпт.
 *
 * Слово в начале задаёт регистр сильнее, чем всё последующее описание: пока
 * каждый запрос начинался с «Illustrate», модель послушно рисовала картинку,
 * какой бы стиль ни выбрали. Рисовальным стилям это подходит — они и есть
 * иллюстрации, — а кинематографическим нужен свой зачин.
 */
const styleOpeners: Partial<Record<MotivationVisualStyle, string>> = {
  cinematic_film: 'A photorealistic cinematic film still that conveys',
  epic_wide: 'A photorealistic wide cinematic frame that conveys',
  night_devotional: 'A photorealistic low-light photograph that conveys',
  painterly_realism: 'A museum-quality oil painting that conveys',
};

const DEFAULT_OPENER = 'Illustrate';

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

  // Ниже храма и выше традиций: ночная сцена и поле битвы — приметы
  // конкретного кадра, тогда как «Гита» говорит лишь о традиции, и без этих
  // двух правил Курукшетра уходила бы в миниатюру. Порядок прежних правил
  // сохранён: то, что работало, продолжает работать так же.
  if (
    /night|lamp|candle|flame|darkness|dusk|ночь|ночн|лампад|свеч|светильник|пламя|тьм|сумерк/.test(
      concepts,
    )
  )
    return MotivationVisualStyle.night_devotional;
  if (
    /battle|army|warrior|battlefield|multitude|битв|сражен|войск|воин|поле боя|курукшетр/.test(
      concepts,
    )
  )
    return MotivationVisualStyle.epic_wide;
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

  const opener = styleOpeners[style] ?? DEFAULT_OPENER;
  const lines = [
    `${opener} this meaning without rendering the quotation: ${meaning}`,
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
