/**
 * Задания для ИИ, который сочиняет промпты по контексту поста.
 *
 * Промпт картинки собирается правилами и потому всегда одинаков по строю;
 * промпт движения и вовсе писался руками. Между тем смысл цитаты у нас уже
 * разобран, источник проверен — из этого можно составить постановку лучше, чем
 * из шаблона.
 *
 * Формат задаём мы, содержание — ИИ. Тот же приём, что с музыкой: модели
 * слушаются конкретики, а не прилагательных, и формулировать её вручную тяжело.
 */

export type PromptKind = 'image' | 'video';

export type PromptDraftInput = {
  meaning: string;
  attribution?: string | null;
  context?: string | null;
  /** Пожелание редактора своими словами — уточняет, но не обязательно. */
  mood?: string | null;
};

const COMMON = [
  'Return only the prompt text: no preamble, no quotation marks, no bullet points.',
  'Write in English — the generation models understand it best.',
  'Never name a real film, artist or existing work: providers reject such prompts.',
];

/**
 * Промпт иллюстрации.
 *
 * Главная беда шаблона — буквализация: «отдавая плоды Мне» из Гиты обернулось
 * детьми с яблоками. Поэтому здесь прямо требуется читать образ как образ и
 * держаться мира источника.
 */
function imageBrief(input: PromptDraftInput): string[] {
  return [
    'Write ONE prompt for an image model. It illustrates the meaning of a quotation in a vertical 9:16 frame for a mobile Story.',
    '',
    'The prompt MUST specify:',
    '1. the scene — who is present, where, at what moment;',
    '2. light — time of day, direction, quality;',
    '3. composition — what is in the foreground, what is behind;',
    '4. mood, in one clause.',
    '',
    'Rules:',
    '- Read figurative wording as metaphor: show what it means, not the objects it names.',
    '- Keep the setting, the figures and the landscape inside the world of the source.',
    '- No text, letters or captions anywhere in the image: the quotation is placed by us afterwards.',
    '- Do not describe a recognizable likeness of a real living or historical person.',
    '- Keep it under 120 words, one paragraph.',
    ...COMMON,
  ];
}

/**
 * Промпт движения.
 *
 * Видеомодель получает готовый кадр, и описывать ей сцену бессмысленно — она
 * её уже видит. Нужно описание того, что движется, и насколько сдержанно.
 */
function videoBrief(input: PromptDraftInput): string[] {
  return [
    'Write ONE prompt for an image-to-video model. The still frame already exists; the prompt describes MOTION only.',
    '',
    'The prompt MUST specify:',
    '1. what moves in the scene and how — name the elements;',
    '2. the speed of that motion;',
    '3. camera behaviour — usually almost still;',
    '4. how light or atmosphere shifts, if at all.',
    '',
    'Rules:',
    '- Do not describe the scene itself, its colours or its composition: the model already has the frame.',
    '- Restraint over spectacle: gentle, natural, unhurried motion. No fast camera moves, no zooms, no morphing.',
    '- Nothing in the frame may transform into something else; faces and hands must stay stable.',
    '- Keep it under 60 words, one paragraph.',
    ...COMMON,
  ];
}

export function buildPromptDraftRequest(
  kind: PromptKind,
  input: PromptDraftInput,
): string {
  const lines = kind === 'image' ? imageBrief(input) : videoBrief(input);
  lines.push('', `Quotation meaning: ${trim(input.meaning, 1_200)}`);
  if (input.attribution?.trim())
    lines.push(`Source: ${trim(input.attribution, 200)}`);
  if (input.context?.trim())
    lines.push(`Verified context: ${trim(input.context, 600)}`);
  if (input.mood?.trim()) lines.push(`Editor's wish: ${trim(input.mood, 300)}`);
  return lines.join('\n');
}

/**
 * Приводит ответ к пригодному виду.
 *
 * Модель любит начинать с «Here is the prompt:» и оборачивать текст в кавычки —
 * в промпт для генерации это ушло бы как есть и сбило результат.
 */
export function cleanDraftedPrompt(raw: string): string {
  return raw
    .replace(/^\s*(here('s| is)[^:]*:|prompt:)\s*/i, '')
    .replace(/^["'«]|["'»]$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2_000);
}

function trim(value: string, limit: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}
