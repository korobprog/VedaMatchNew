/**
 * Викторина Вдохновения (VED-243): «какой стих отображает эта картинка?».
 *
 * Отдельной разметки «картинка для викторины» в данных нет. Вопросом
 * становится опубликованная иллюстрация к шлоке Бхагавад-гиты, у которой
 * читается номер стиха: ответ — «глава.стих», три других варианта — номера
 * других стихов той же книги. Открытки (`captionInImage`) в викторину не
 * идут: на них напечатан сам текст, а часто и номер, — угадывать нечего.
 *
 * Здесь только чистая логика: распознать Гиту и номер, выбрать вопросы и
 * перемешать варианты от семени. База — в `MotivationQuizService`.
 */

import { splitWorkLocator } from './feed-attribution';

/** Сколько вариантов у вопроса: правильный и три неверных. */
export const QUIZ_OPTIONS = 4;
/** Вопросов в раунде: хватает на пару минут и не утомляет. */
export const QUIZ_ROUND = 10;
/** Длиннее текст под ответом не показываем — это подпись, а не глава. */
const QUIZ_TEXT_MAX = 600;

/**
 * Число стихов в главах «Бхагавад-гиты как она есть». По нему проверяется
 * номер из подписи и генерируются неверные варианты: вариант «2.95» выдал бы
 * себя сам — во второй главе 72 стиха.
 */
export const GITA_VERSE_COUNTS: readonly number[] = [
  46, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 35, 27, 20, 24, 28, 78,
];

const GITA_PATTERN =
  /бхагавад[-‐‑–—\s]?гит|bhagavad[-‐‑–—\s]?g[iī]t|(^|[^\p{L}])бг([^\p{L}]|$)/iu;

export function isGitaSource(...texts: (string | null | undefined)[]): boolean {
  return texts.some((text) => Boolean(text) && GITA_PATTERN.test(text!));
}

/** Номер стиха Гиты: глава, стих и, для сдвоенных шлок, конец диапазона. */
export interface GitaRef {
  chapter: number;
  verse: number;
  verseEnd: number | null;
}

export function formatGitaRef(ref: GitaRef): string {
  return ref.verseEnd === null
    ? `${ref.chapter}.${ref.verse}`
    : `${ref.chapter}.${ref.verse}-${ref.verseEnd}`;
}

function validRef(
  chapter: number,
  verse: number,
  verseEnd: number | null,
): GitaRef | null {
  const count = GITA_VERSE_COUNTS[chapter - 1];
  if (!count || verse < 1 || verse > count) return null;
  if (verseEnd !== null && (verseEnd <= verse || verseEnd > count)) return null;
  return { chapter, verse, verseEnd };
}

/**
 * Номер стиха из строки: «2.11», «2:11», «БГ 2.11», «16.13–14», «глава 2,
 * стих 14». «1.2.12» — это «Бхагаватам», а не Гита: три числа подряд номером
 * Гиты не считаются.
 */
export function parseGitaRef(raw: string | null | undefined): GitaRef | null {
  const text = (raw ?? '').normalize('NFKC');
  const worded =
    /гл(?:ав\p{L}*)?\.?\s*(\d{1,2})[\s,.;]+(?:стих|текст|шлок)\p{L}*\.?\s*(\d{1,3})(?:\s*[-‐‑–—]\s*(\d{1,3}))?/iu.exec(
      text,
    );
  if (worded)
    return validRef(
      Number(worded[1]),
      Number(worded[2]),
      worded[3] ? Number(worded[3]) : null,
    );
  const numeric =
    /(?<![\d.:])(\d{1,2})\s*[.:]\s*(\d{1,3})(?![\d]|[.:]\d)(?:\s*[-‐‑–—]\s*(\d{1,3})(?!\d))?/u.exec(
      text,
    );
  if (!numeric) return null;
  return validRef(
    Number(numeric[1]),
    Number(numeric[2]),
    numeric[3] ? Number(numeric[3]) : null,
  );
}

/** Что нужно от поста, чтобы сделать из него вопрос. */
export interface QuizSourcePost {
  id: string;
  slug: string;
  imageUrl: string | null;
  attributionWork: string | null;
  attributionLocator: string | null;
  title: string | null;
  /** Текст под ответом: `imageText` или сама цитата. */
  text: string | null;
  quote: {
    work: string | null;
    locator: string | null;
    vedabaseBookSlug: string | null;
  } | null;
}

export interface QuizCandidate {
  id: string;
  slug: string;
  imageUrl: string;
  ref: GitaRef;
  text: string;
}

/**
 * Годится ли пост в вопрос. Номер ищем там же и в том же порядке, что и
 * лента Гиты (`effectiveLocator`): поле локатора, хвост источника
 * («Бхагавад-гита 2.11»), хвост заголовка, — и последним локатор цитаты.
 */
export function quizCandidate(post: QuizSourcePost): QuizCandidate | null {
  const imageUrl = post.imageUrl?.trim();
  if (!imageUrl) return null;
  const gita =
    post.quote?.vedabaseBookSlug === 'bhagavad-gita' ||
    isGitaSource(post.attributionWork, post.title, post.quote?.work);
  if (!gita) return null;
  const ref =
    parseGitaRef(post.attributionLocator) ??
    parseGitaRef(splitWorkLocator(post.attributionWork).locator) ??
    parseGitaRef(splitWorkLocator(post.title).locator) ??
    parseGitaRef(post.quote?.locator);
  if (!ref) return null;
  return {
    id: post.id,
    slug: post.slug,
    imageUrl,
    ref,
    text: clampText(post.text ?? ''),
  };
}

function clampText(text: string): string {
  const clean = text.trim();
  if (clean.length <= QUIZ_TEXT_MAX) return clean;
  const cut = clean.slice(0, QUIZ_TEXT_MAX);
  const space = cut.lastIndexOf(' ');
  return `${(space > QUIZ_TEXT_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Генератор от семени (mulberry32). Не `Math.random`: один и тот же раунд
 * по одному семени собирается одинаково — это и проверяется тестами, и
 * позволяет перезагрузить страницу, не потеряв вопросы.
 */
export function seededRandom(seed: string): () => number {
  // FNV-1a — строку в 32-битное число.
  let state = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 0x01000193);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Перемешивание Фишера — Йетса; исходный массив не трогаем. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function versesOf(ref: GitaRef): Set<string> {
  const verses = new Set<string>();
  for (let v = ref.verse; v <= (ref.verseEnd ?? ref.verse); v += 1)
    verses.add(`${ref.chapter}.${v}`);
  return verses;
}

/** Пересекаются ли стихи: «1.17» при ответе «1.16-18» — тоже правильный. */
function overlaps(a: GitaRef, b: GitaRef): boolean {
  const left = versesOf(a);
  return [...versesOf(b)].some((verse) => left.has(verse));
}

/**
 * Три неверных варианта. Сначала — номера других иллюстраций викторины:
 * они выглядят так же правдоподобно, как ответ, и не выдают его формой.
 * Не хватило — случайные настоящие стихи Гиты.
 */
export function pickDistractors(
  answer: GitaRef,
  pool: readonly GitaRef[],
  random: () => number,
  count = QUIZ_OPTIONS - 1,
): GitaRef[] {
  const picked: GitaRef[] = [];
  const accept = (ref: GitaRef) => {
    if (picked.length >= count) return;
    if (overlaps(ref, answer)) return;
    if (picked.some((other) => overlaps(other, ref))) return;
    picked.push(ref);
  };
  for (const ref of shuffle(pool, random)) accept(ref);
  // Стихов в Гите 700 — за сотню попыток три свободных найдутся всегда.
  for (let attempt = 0; picked.length < count && attempt < 100; attempt += 1) {
    const chapter = 1 + Math.floor(random() * GITA_VERSE_COUNTS.length);
    const verse = 1 + Math.floor(random() * GITA_VERSE_COUNTS[chapter - 1]);
    accept({ chapter, verse, verseEnd: null });
  }
  return picked;
}

export interface QuizQuestion {
  id: string;
  slug: string;
  imageUrl: string;
  answer: string;
  options: string[];
  text: string;
}

/**
 * Раунд викторины. Одна иллюстрация — один вопрос: две картинки к одному
 * стиху в раунде не встречаются, иначе вторая отвечается по памяти, а не по
 * рисунку.
 */
export function buildQuiz(
  candidates: readonly QuizCandidate[],
  seed: string,
  limit = QUIZ_ROUND,
): QuizQuestion[] {
  const random = seededRandom(seed);
  const pool = candidates.map((candidate) => candidate.ref);
  const seen = new Set<string>();
  const questions: QuizQuestion[] = [];
  for (const candidate of shuffle(candidates, random)) {
    if (questions.length >= limit) break;
    const answer = formatGitaRef(candidate.ref);
    if (seen.has(answer) || seen.has(candidate.imageUrl)) continue;
    seen.add(answer);
    seen.add(candidate.imageUrl);
    const distractors = pickDistractors(candidate.ref, pool, random);
    questions.push({
      id: candidate.id,
      slug: candidate.slug,
      imageUrl: candidate.imageUrl,
      answer,
      options: shuffle(
        [answer, ...distractors.map((ref) => formatGitaRef(ref))],
        random,
      ),
      text: candidate.text,
    });
  }
  return questions;
}

/** Семя из адреса: короткая строка из букв и цифр; иначе — новое. */
export function quizSeed(raw: string | undefined, fresh: () => string): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : fresh();
}
