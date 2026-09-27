/**
 * Озвучка постов Блог-ленты (VED-476) — чистая часть и общий «диктор».
 *
 * Читает браузер (`speechSynthesis`): голос системы, без сети и без платы
 * за синтез на каждое нажатие — тот же выбор, что у озвучки во
 * «Вдохновении». Помощники оттуда продублированы, а не импортированы:
 * сервисы портала друг друга не импортируют.
 *
 * Диктор один на страницу: включили второй пост — первый замолкает, и
 * кнопка первого гаснет сама (подписка через `useSyncExternalStore`).
 */

/**
 * Адреса в тексте (VED-550): `https://…`, `www.…` и голые домены вида
 * `site.ru/путь`; точка или запятая за адресом остаётся тексту. Голосом
 * ссылку не читают — её не набрать на слух, а пост, присланный из
 * Образования, озвучивался одной ссылкой. Зона домена — только строчными
 * латинскими буквами или «рф»: так «Бхагавад-гита 2.13» и «т. е.» не
 * считаются адресами, а опечатка «конец.Начало» не съедает слова.
 */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S*[^\s.,;:!?)\]»"'…]/gi;
const BARE_DOMAIN_PATTERN =
  /(?<![\p{L}\p{N}@.\-/])(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-z]{2,24}|(?:[а-яёА-ЯЁ0-9](?:[а-яёА-ЯЁ0-9-]*[а-яёА-ЯЁ0-9])?\.)+рф)(?::\d+)?(?:\/(?:\S*[^\s.,;:!?)\]»"'…])?)?(?![\p{L}\p{N}])/gu;

/** Текст без адресов; хвосты вроде «Подробнее: » остаются без пустоты. */
export function stripUrls(text: string): string {
  return text
    .replace(URL_PATTERN, " ")
    .replace(BARE_DOMAIN_PATTERN, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Склейка частей для голоса: без адресов, пустые и одни знаки выпадают. */
function joinSpoken(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => stripUrls(part ?? ""))
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
    .join(". ")
    .replace(/([.!?…])\.\s/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Что читать: заголовок и текст, без ссылок; пустые части выпадают. */
export function buildSpokenPost(post: {
  title?: string | null;
  text?: string | null;
}): string {
  return joinSpoken([post.title, post.text]);
}

/**
 * Пост, отправленный из Образования кнопкой «В Блог-ленту» (VED-490), несёт
 * в тексте только описание, а то и один адрес. Читать нужно сам материал
 * (VED-550): его id берём из ссылки поста `/library/entry/<id>` — путь на
 * портале или полный адрес.
 */
export function libraryEntryIdOf(post: {
  link?: { url: string } | null;
}): string | null {
  const url = post.link?.url;
  if (!url) return null;
  let path = url;
  try {
    path = new URL(url, "https://vedamatch.local").pathname;
  } catch {
    return null;
  }
  const match = /^\/library\/entry\/([^/?#]+)\/?$/.exec(path);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]) || null;
  } catch {
    return null;
  }
}

/** Материал Образования, как его отдаёт `GET /library/entries/:id`. */
export interface SpokenLibraryEntry {
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  body?: string | null;
}

/**
 * Что читать у материала: заголовок и основной текст — у катхи и статьи это
 * `body`, у ссылки на чужой сайт основного текста нет, тогда описание.
 * Служебного (источник, тип, домен) голос не читает.
 */
export function buildSpokenLibraryEntry(entry: SpokenLibraryEntry): string {
  const title = entry.titleRu?.trim() || entry.titleEn?.trim() || null;
  const main =
    entry.body?.trim() ||
    entry.descriptionRu?.trim() ||
    entry.descriptionEn?.trim() ||
    null;
  return joinSpoken([title, main]);
}

/**
 * Текст для кнопки «Озвучить» у поста: у присланного из Образования — сам
 * материал (подгружает `loadEntry`), иначе и при любой неудаче — заголовок
 * и текст поста без ссылок.
 */
export async function resolveSpokenPostText(
  post: {
    title?: string | null;
    text?: string | null;
    link?: { url: string } | null;
  },
  loadEntry: (id: string) => Promise<SpokenLibraryEntry | null>,
): Promise<string> {
  const entryId = libraryEntryIdOf(post);
  if (entryId) {
    try {
      const entry = await loadEntry(entryId);
      const text = entry ? buildSpokenLibraryEntry(entry) : "";
      if (text) return text;
    } catch {
      // Материал удалён или сеть подвела — прочитаем сам пост.
    }
  }
  return buildSpokenPost(post);
}

/**
 * Язык голоса по буквам, а не по интерфейсу: латинская шлока русским
 * голосом звучит как «кырышна».
 */
export function spokenLanguage(text: string): string {
  return /[Ѐ-ӿ]/.test(text) ? "ru-RU" : "en-US";
}

/**
 * Длинный пост — кусками по фразам. Chrome обрывает одно высказывание
 * через ~15 секунд, а пост бывает на восемь страниц; очередь коротких
 * кусков читается целиком. Фраза длиннее предела режется по словам.
 */
export function speechChunks(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if ((current + sentence).length <= max) {
      current += sentence;
      continue;
    }
    push();
    if (sentence.length <= max) {
      current = sentence;
      continue;
    }
    for (const word of sentence.split(/\s+/)) {
      if ((current + " " + word).trim().length > max) push();
      current = current ? `${current} ${word}` : word;
    }
  }
  push();
  return chunks;
}

export function canSpeak(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

/**
 * Что делает кнопка озвучки на панели Блог-ленты (VED-514): во время чтения —
 * пауза, на паузе — продолжить с того же места, иначе — читать сначала.
 */
export function speakButtonAction(state: {
  speaking: boolean;
  paused: boolean;
}): "pause" | "resume" | "start" {
  if (state.speaking) return "pause";
  if (state.paused) return "resume";
  return "start";
}

// ---------- Диктор ----------

let speakingId: string | null = null;
let listeners: Array<() => void> = [];

/**
 * Пауза — не `speechSynthesis.pause()`: Chrome на Android её не умеет и
 * обрывает речь. Поэтому на паузе чтение отменяется, а запоминается кусок, на
 * котором остановились (`speechChunks`), — продолжение читает с него.
 */
let paused: { id: string; text: string; chunk: number } | null = null;
let currentText = "";
let currentChunk = 0;
/** Поколение чтения: обработчики отменённых фраз не трогают новое. */
let generation = 0;

function emit(next: string | null) {
  speakingId = next;
  for (const listener of listeners) listener();
}

export function subscribeBlogSpeech(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function getBlogSpeakingId(): string | null {
  return speakingId;
}

export function getBlogSpeakingServerId(): string | null {
  return null;
}

/** Пост, чтение которого стоит на паузе. */
export function getBlogPausedId(): string | null {
  return paused?.id ?? null;
}

export function getBlogPausedServerId(): string | null {
  return null;
}

export function stopBlogSpeech(): void {
  generation += 1;
  paused = null;
  if (canSpeak()) window.speechSynthesis.cancel();
  emit(null);
}

/** Прочитать пост; `false` — читать нечего или браузер не умеет. */
export function speakBlogPost(
  id: string,
  text: string,
  fromChunk = 0,
): boolean {
  if (!canSpeak() || !text) return false;
  generation += 1;
  const own = generation;
  paused = null;
  window.speechSynthesis.cancel();
  const chunks = speechChunks(text);
  const lang = spokenLanguage(text);
  currentText = text;
  currentChunk = Math.min(Math.max(fromChunk, 0), chunks.length - 1);
  chunks.slice(currentChunk).forEach((chunk, offset) => {
    const at = currentChunk + offset;
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = lang;
    const last = at === chunks.length - 1;
    utterance.onstart = () => {
      if (own === generation) currentChunk = at;
    };
    // Кнопка гаснет по концу последнего куска или по ошибке любого, но
    // только если это всё ещё то же чтение, а не уже следующее или пауза.
    utterance.onend = () => {
      if (last && own === generation) emit(null);
    };
    utterance.onerror = () => {
      if (own === generation) emit(null);
    };
    window.speechSynthesis.speak(utterance);
  });
  emit(id);
  return true;
}

/** Пауза: запомнить место и замолчать. */
export function pauseBlogSpeech(): void {
  if (!speakingId) return;
  const id = speakingId;
  generation += 1;
  if (canSpeak()) window.speechSynthesis.cancel();
  paused = { id, text: currentText, chunk: currentChunk };
  emit(null);
}

/** Продолжить с места паузы; `false` — паузы нет. */
export function resumeBlogSpeech(): boolean {
  if (!paused) return false;
  const { id, text, chunk } = paused;
  return speakBlogPost(id, text, chunk);
}
