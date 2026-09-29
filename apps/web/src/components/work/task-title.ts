/**
 * Название задачи: как оно собирается из написанного и как правится.
 *
 * Поле названия при правке — многострочное: в одну строку длинное название
 * обрезалось на середине, и карточка открывалась с «Добавить кнопку сохр»
 * вместо текста. Но само название однострочное: перевод строки в заголовке
 * ломает и доску, и список, поэтому вставленный из письма текст схлопывается
 * в строку.
 */

/** Схлопывает переводы строк и лишние пробелы: заголовок — одна строка. */
export function normalizeTaskTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Что сохранять после правки: `null` — сохранять нечего. Пустое название не
 * сохраняется никогда, иначе карточку не найти ни на доске, ни в поиске.
 */
export function titleToSave(raw: string, current: string): string | null {
  const next = normalizeTaskTitle(raw);
  if (!next) return null;
  return next === current ? null : next;
}

/**
 * Сколько букв остаётся в названии, когда в поле написали целую задачу.
 *
 * Восемьдесят — это две строки на телефоне: карточка остаётся карточкой, а не
 * абзацем, и в колонку помещается больше одной задачи.
 */
export const TITLE_SOFT_MAX = 80;

/** Совсем короткий обрывок хуже целого предложения: до этой длины не режем. */
const MIN_TITLE = 24;

/**
 * Заголовок по описанию задачи (VED-324, VED-647).
 *
 * В форме новой задачи одно поле, и это ОПИСАНИЕ: «я задолбался писать
 * отдельно заголовок, потом специально заходить в недоделанную задачу и там
 * писать описание». Человек пишет задачу как думает, заголовок собирается сам.
 *
 * VED-647: «Пусть как раньше это просто будет первое предложение». Выделение
 * ЗАГЛАВНЫМИ (VED-580, VED-637) заголовок больше не собирает — `capsTitle`
 * остался только функцией разбора; заголовок режется по границам, а не по
 * счётчику букв:
 * 1. Есть перевод строки — это готовая граница, её человек поставил сам:
 *    заголовком становится первая строка.
 * 2. Есть конец предложения — берём ПЕРВОЕ предложение: заголовок отвечает на
 *    «что случилось», а подробности читаются в описании.
 * 3. Иначе — по последнему пробелу в пределах длины, и заголовок получает
 *    многоточие: без него обрыв читается как опечатка.
 *
 * Слово пополам не рвём никогда, кроме одного случая: если первое слово само
 * длиннее лимита — тогда резать больше негде. Слишком короткий обрывок
 * («Не работает.») заголовком тоже не делаем: до `MIN_TITLE` границы
 * пропускаем и берём следующую.
 *
 * Выводим из текста, а не спрашиваем у нейросети: это платный вызов на каждую
 * карточку, а решение тратить деньги принимает заказчик, а не форма; и
 * заголовок должен быть предсказуемым. Поправить руками можно всегда, см.
 * `taskFromDraft`.
 */
export function deriveTaskTitle(
  description: string,
  limit: number = TITLE_SOFT_MAX,
): string {
  const text = description.trim();
  if (!text) return "";
  return sentenceTitle(text, limit);
}

/** Первая строка, в ней — первое предложение (VED-324). */
function sentenceTitle(text: string, limit: number): string {
  const newline = text.search(/\r?\n/);
  const head = (newline >= 0 ? text.slice(0, newline) : text).trim();
  // Текст начался с пустой строки — границы в ней нет, ищем дальше.
  if (!head) return sentenceTitle(text.slice(newline + 1).trim(), limit);

  const window = head.slice(0, limit + 1);
  for (const match of window.matchAll(/[.!?…]["»)]?(?:\s|$)/g)) {
    const end = match.index + match[0].trimEnd().length;
    if (end >= MIN_TITLE) return head.slice(0, end).trim();
  }

  return cutToLimit(head, limit);
}

/** По последнему пробелу в пределах длины, с многоточием на обрыве. */
function cutToLimit(line: string, limit: number): string {
  if (line.length <= limit) return line;
  const space = line.slice(0, limit).lastIndexOf(" ");
  const at = space >= MIN_TITLE ? space : limit;
  return `${line.slice(0, at).trim()}…`;
}

/** Слово: буквы и цифры, через дефис — одно слово («ЧАТ-БОТ», «VED-580»). */
const WORD = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
/** Конец предложения или строки между словами рвёт серию заглавных. */
const RUN_BREAK = /[.!?…\n]/;

interface CapsWord {
  text: string;
  letters: number;
}

/**
 * Заголовок по словам, выделенным ЗАГЛАВНЫМИ (VED-580, VED-637).
 *
 * Заказчик: «Сначала админ заполняет описание задачи, а потом выделяет
 * заглавными буквами какую-то его часть — 2, 3 или более слов, которые как раз
 * и нужно будет выделить в заголовок. Если слова стоят в разных частях
 * описания — соедини их». `null` — выделения нет.
 *
 * Выделение отличаем от обычных сокращений, которых в задачах полно («ISKCON»,
 * «API», «ИИ», «СМС», «VED-580»):
 * - слово с цифрами — не выделение, а номер или ключ задачи;
 * - серия — подряд идущие заглавные слова в пределах одного предложения;
 *   весом серии считаются слова от трёх букв, предлоги («В», «НА») входят в
 *   серию, но веса не дают;
 * - серия засчитывается, если в ней два веских слова и больше, или одно, но
 *   кириллицей от четырёх букв («сделай кнопку ДАЛЕЕ»): латиница и короткое
 *   одиночкой — это сокращение, а не выделение;
 * - одной засчитанной серии хватает, даже из одного слова («перенеси в
 *   РАЗНОЕ»). До VED-637 одинокое слово отдавало заголовок первому
 *   предложению, теперь выделение — единственный источник, и отбрасывать
 *   явное выделение значило бы оставить задачу без заголовка;
 * - если в тексте нет ни одного строчного слова (набрано с CapsLock), выделять
 *   нечем: заголовок пишут руками.
 *
 * Серии из разных мест соединяются пробелом по порядку в тексте: заказчик
 * собирает из них одну фразу. Регистр — как у заголовка: первая заглавная,
 * остальные строчные; латинские слова остаются как есть, это почти всегда
 * сокращения и названия.
 */
export function capsTitle(description: string): string | null {
  const runs: CapsWord[][] = [];
  let run: CapsWord[] = [];
  let hasLower = false;
  let prevEnd = 0;
  const close = () => {
    if (run.length) runs.push(run);
    run = [];
  };

  for (const match of description.matchAll(WORD)) {
    const token = match[0];
    if (RUN_BREAK.test(description.slice(prevEnd, match.index))) close();
    prevEnd = match.index + token.length;
    if (/\p{N}/u.test(token)) continue;
    if (/\p{Ll}/u.test(token)) {
      hasLower = true;
      close();
      continue;
    }
    run.push({ text: token, letters: token.replace(/-/g, "").length });
  }
  close();
  if (!hasLower) return null;

  const weight = (words: CapsWord[]) =>
    words.filter((word) => word.letters >= 3).length;
  const chosen = runs.filter((words) => {
    const strong = weight(words);
    if (strong >= 2) return true;
    return (
      strong === 1 &&
      words.some(
        (word) => word.letters >= 4 && /\p{Script=Cyrillic}/u.test(word.text),
      )
    );
  });
  if (!chosen.length) return null;

  const title = chosen
    .flat()
    .map((word) =>
      /\p{Script=Cyrillic}/u.test(word.text)
        ? word.text.toLowerCase()
        : word.text,
    )
    .join(" ");
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/**
 * Что уходит на сервер из формы новой задачи (VED-324).
 *
 * Описание — весь написанный текст, а не хвост после заголовка: хвост
 * начинался бы с середины фразы, и казалось бы, что часть текста пропала
 * (этим болела прежняя форма, VED-104). Исключение ровно одно — короткая
 * строка, которая целиком стала заголовком: второй её копией карточка ничего
 * не приобретёт, а значок «в карточке есть текст» на доске начал бы врать у
 * каждой односложной задачи.
 */
export interface TaskDraftFields {
  title: string;
  /** Пусто — весь текст уместился в заголовок, описывать нечего. */
  description: string;
}

/**
 * Поля новой задачи по написанному описанию. `titleOverride` — то, что человек
 * вписал в заголовок руками; пустая строка и пробелы означают «собери сам».
 * Пустой `title` в ответе — только у пустого описания.
 */
export function taskFromDraft(
  rawDescription: string,
  titleOverride?: string | null,
  limit: number = TITLE_SOFT_MAX,
): TaskDraftFields {
  const text = rawDescription.trim();
  if (!text) return { title: "", description: "" };
  const manual = normalizeTaskTitle(titleOverride ?? "");
  const title = manual || deriveTaskTitle(text, limit);
  return { title, description: text === title ? "" : text };
}
