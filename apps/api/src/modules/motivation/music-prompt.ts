/**
 * Задание для ИИ, который сочиняет промпт музыкальной подложки.
 *
 * Писать такие промпты руками тяжело: модель музыки слушается не прилагательных,
 * а инструментовки, темпа, регистра и прямых запретов. На «медитативно и
 * спокойно» она выдаёт приятный фон, а нужен вес.
 *
 * Поэтому просим наш же ИИ — тот, что пишет тексты постов, — развернуть смысл
 * цитаты в постановку. Он видит смысл, а формат задаём мы.
 */
/**
 * Замысел по умолчанию, когда редактор ничего не написал.
 *
 * Отказывать в этом случае неправильно: кнопка должна давать результат сразу, а
 * описание — уточнять его, а не быть условием запуска.
 */
export const DEFAULT_MUSIC_BRIEF =
  'A contemplative instrumental bed for a spoken spiritual quotation: unhurried, ' +
  'restrained, leaving room for the voice.';

export function buildMusicPromptRequest(input: {
  meaning: string;
  attribution?: string | null;
  mood?: string | null;
}): string {
  const lines = [
    'Write ONE prompt in English for a text-to-music model.',
    'The music is an instrumental bed under a spoken quotation in a short vertical video.',
    '',
    'The prompt MUST specify, in this order:',
    '1. instrumentation — name actual instruments, not genres;',
    '2. register and tempo — say low or high, give an approximate bpm;',
    '3. dynamics and space — loudness, silences between phrases, reverb;',
    '4. harmonic behaviour — whether it resolves or stays suspended;',
    '5. explicit negatives — what must not appear.',
    '',
    'Rules:',
    '- Always end with "Strictly instrumental, no vocals."',
    '- Never name a real film, composer, band or existing track: music providers reject such prompts.',
    '- Keep it under 90 words, one paragraph, no bullet points, no quotation marks.',
    '- The music must not illustrate the words literally; it carries the mood underneath them.',
    '- Restraint over drama: it plays under speech and must never fight it.',
    '',
    `Quotation meaning: ${input.meaning.replace(/\s+/g, ' ').trim().slice(0, 1_200)}`,
  ];
  if (input.attribution?.trim())
    lines.push(`Source: ${input.attribution.trim().slice(0, 200)}`);
  if (input.mood?.trim())
    lines.push(
      `Desired mood from the editor: ${input.mood.trim().slice(0, 300)}`,
    );
  lines.push('', 'Return only the prompt text, nothing else.');
  return lines.join('\n');
}

/**
 * Приводит ответ модели к пригодному виду.
 *
 * Модель любит добавлять вступление вроде «Here is your prompt:» и оборачивать
 * текст в кавычки — в промпт для музыки это уйдёт как есть и собьёт результат.
 */
export function cleanMusicPrompt(raw: string): string {
  return raw
    .replace(/^\s*(here('s| is)[^:]*:|prompt:)\s*/i, '')
    .replace(/^["'«]|["'»]$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_000);
}
