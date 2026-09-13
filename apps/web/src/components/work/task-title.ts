/**
 * Название задачи при правке.
 *
 * Поле названия — многострочное: в одну строку длинное название обрезалось
 * на середине, и карточка открывалась с «Добавить кнопку сохр» вместо текста.
 * Но само название однострочное: перевод строки в заголовке ломает и доску,
 * и список, поэтому вставленный из письма текст схлопывается в строку.
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

export interface TaskDraftSplit {
  title: string;
  /** Пусто — делить было нечего. */
  description: string;
}

/**
 * Длинный текст из поля новой задачи: начало — в название, текст — в
 * описание.
 *
 * В форме одно поле, и подписано оно как название, но пишут в него задачу
 * целиком — так устроена спешка, и спорить с ней бесполезно. Раньше вся
 * простыня становилась заголовком: карточка на доске превращалась в абзац, а
 * описание оставалось пустым.
 *
 * Режем по границам, а не по счётчику букв:
 * 1. Есть перевод строки — это готовая граница, её человек поставил сам:
 *    первая строка — название, остальное — описание.
 * 2. Есть конец предложения в пределах длины — режем по нему, точка остаётся
 *    в названии, и оно читается целой мыслью.
 * 3. Иначе — по последнему пробелу, и название получает многоточие: без него
 *    обрыв читается как опечатка.
 *
 * Если строку пришлось резать (2 и 3), в описание уходит она целиком, а не
 * хвост (VED-104). Хвост начинался с середины фразы — «панели либо прям в
 * сервисе…», — и казалось, что часть текста пропала: начало пряталось в
 * урезанном названии за многоточием.
 *
 * Слово пополам не рвём никогда, кроме одного случая: если первое слово само
 * длиннее лимита — тогда резать больше негде.
 */
export function splitTaskDraft(
  raw: string,
  limit: number = TITLE_SOFT_MAX,
): TaskDraftSplit {
  const text = raw.trim();
  if (!text) return { title: "", description: "" };

  const newline = text.search(/\r?\n/);
  if (newline >= 0) {
    const head = text.slice(0, newline).trim();
    const tail = text.slice(newline).trim();
    // Первая строка тоже бывает длинной: делим её дальше, а остаток
    // приклеиваем к тому, что человек и так вынес под неё.
    const split = splitTaskDraft(head, limit);
    return {
      title: split.title,
      description: [split.description, tail].filter(Boolean).join("\n\n"),
    };
  }

  if (text.length <= limit) return { title: text, description: "" };

  const window = text.slice(0, limit + 1);
  let cut = -1;
  for (const match of window.matchAll(/[.!?…]["»)]?\s/g)) {
    const end = match.index + match[0].trimEnd().length;
    if (end >= MIN_TITLE) cut = end;
  }
  if (cut > 0) {
    return { title: text.slice(0, cut).trim(), description: text };
  }

  const space = window.slice(0, limit).lastIndexOf(" ");
  const at = space >= MIN_TITLE ? space : limit;
  return { title: `${text.slice(0, at).trim()}…`, description: text };
}

/**
 * Описание повторяет название с начала — значит, строку резали, и в описании
 * текст целиком. Подсказка под полем говорит тогда «весь текст», а не
 * «остальное»: иначе она обещает то, чего не будет.
 */
export function descriptionHasWholeText(split: TaskDraftSplit): boolean {
  const head = split.title.replace(/…$/, "");
  return Boolean(head) && split.description.startsWith(head);
}
