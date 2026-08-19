import { createHash } from 'node:crypto';

export function normalizeQuote(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/[—–]/g, '-')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function quoteFingerprint(text: string): string {
  return createHash('sha256').update(normalizeQuote(text)).digest('hex');
}

/**
 * A single long text (e.g. a whole book chapter) can contain many quotable
 * sentences. Capped so one pathological unit can't dominate a discovery batch.
 */
const MAX_SENTENCES_PER_TEXT = 20;

/**
 * Отсекает повествование до дорогих шагов.
 *
 * Прежний отбор смотрел только на длину, поэтому «Мукунда облачился в мантию
 * волшебника Мерлина» проходил наравне со строфой из Гиты, а нейросети
 * оставалось честно пересказать описание одежды. Эвристика грубая и работает
 * как решето: её задача — убрать явную прозу, а не выбрать лучшее.
 */
export function isQuotableSentence(sentence: string): boolean {
  const text = sentence.trim();
  if (text.length < 40 || text.length > 400) return false;

  // Границы слов пишутся через \p{L}, а не через \b и \w: в JavaScript оба
  // ASCII-only и на кириллице просто не срабатывают.
  const edge = String.raw`(?:^|[^\p{L}])`;

  // Прямая речь и сценические ремарки — это диалог, а не наставление.
  if (/^[—–-]\s/u.test(text)) return false;
  if (
    new RegExp(
      `${edge}(сказал|сказала|спросил|ответил|воскликнул|добавил|продолжил)`,
      'iu',
    ).test(text)
  )
    return false;

  // Даты и номера — приметы репортажа, а не наставления.
  if (/\d{4}\s*(год|г\.)|стр\.|#\d+/iu.test(text)) return false;

  // Несколько имён собственных в середине фразы — почти наверняка биография.
  const innerCapitals = (
    text.slice(1).match(/(?:^|[^\p{L}])[А-ЯЁA-Z]\p{Ll}{2,}/gu) ?? []
  ).length;
  if (innerCapitals >= 2) return false;

  // Наставление обобщает: модальность или отвлечённое понятие.
  const modal = new RegExp(
    `${edge}(нужно|надо|должен|должны|следует|нельзя|значит|означает|means|must|should)`,
    'iu',
  ).test(text);
  // Английские основы нужны наравне с русскими: в библиотеке есть книги на
  // английском, и без них они отсеивались бы целиком.
  const abstract =
    /(душ[аи]|преданност|служени|смирени|милост|истин|мудрост|сознани|любв|вер[аы]|терпени|разум|счасть|страдани|долг|свобод|ум[аеу]?(?![\p{L}]))/iu.test(
      text,
    ) ||
    /(soul|devotion|service|humility|mercy|truth|wisdom|consciousness|love|faith|patience|mind|intelligence|happiness|suffering|duty|freedom|surrender)/iu.test(
      text,
    );
  const teaching = modal || abstract;

  // Прошедшее время без обобщения — рассказ о событии.
  const pastTense =
    /\p{L}+(?:ла|ло|ли|л)(?![\p{L}])/u.test(text) &&
    !new RegExp(
      `${edge}(был|была|было|были|есть|бывает)(?![\\p{L}])`,
      'iu',
    ).test(text);
  if (pastTense && !teaching) return false;

  return teaching;
}

export function extractQuoteSentences(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/u)
    .map((part) => part.trim())
    .filter(isQuotableSentence)
    .slice(0, MAX_SENTENCES_PER_TEXT);
  if (sentences.length > 0) return sentences;
  // Единый короткий фрагмент (стих, афоризм) тоже проходит отбор — но проходит,
  // а не попадает сюда автоматически, как было раньше.
  const whole = text.trim();
  return isQuotableSentence(whole) ? [whole] : [];
}

/**
 * Подрезает окно контекста до границ предложений.
 *
 * Слепой `slice` по символам обрывал текст на середине слова — в карточке
 * модерации это выглядело как «х, словно на карте». Края двигаются только
 * внутрь: наружу они бы вышли за отведённый размер окна. Если внутри нет
 * границы предложения, отступаем хотя бы до пробела, чтобы не рвать слово.
 *
 * @param mustContain фрагмент, который обязан остаться целиком (сама цитата).
 */
export function snapToSentences(
  text: string,
  start: number,
  end: number,
  mustContain?: string,
): string {
  const to = Math.max(0, Math.min(end, text.length));
  const from = wordAlignedStart(text, Math.max(0, Math.min(start, to)));
  let slice = text.slice(from, to);
  const keepTo = mustContain
    ? slice.indexOf(mustContain) + mustContain.length
    : -1;

  if (to < text.length) {
    const boundary = lastSentenceEnd(slice);
    if (boundary > 0 && (keepTo < 0 || boundary >= keepTo))
      slice = slice.slice(0, boundary);
    else {
      const space = slice.lastIndexOf(' ');
      if (space > 0 && (keepTo < 0 || space >= keepTo))
        slice = slice.slice(0, space);
    }
  }

  return slice.trim();
}

/** Насколько далеко назад разрешено отступить, чтобы не разрезать слово. */
const MAX_WORD_LOOKBACK = 40;

/**
 * Двигает левый край к началу слова. Назад — не дальше одного слова, иначе на
 * тексте без пробелов окно уехало бы к началу главы и вышло за свой размер;
 * в таком случае вместо этого сдвигаемся вперёд.
 */
function wordAlignedStart(text: string, start: number): number {
  if (start <= 0) return 0;
  if (
    !/\p{L}/u.test(text[start] ?? '') ||
    !/\p{L}/u.test(text[start - 1] ?? '')
  )
    return start;

  let back = start;
  while (back > 0 && /\p{L}/u.test(text[back - 1] ?? '')) back -= 1;
  if (start - back <= MAX_WORD_LOOKBACK) return back;

  let forward = start;
  while (forward < text.length && /\p{L}/u.test(text[forward] ?? ''))
    forward += 1;
  while (forward < text.length && /\s/u.test(text[forward] ?? '')) forward += 1;
  return forward;
}

function lastSentenceEnd(slice: string): number {
  const matches = [...slice.matchAll(/[.!?]["»)]?(?=\s|$)/gu)];
  const last = matches.at(-1);
  return last ? last.index + last[0].length : -1;
}
