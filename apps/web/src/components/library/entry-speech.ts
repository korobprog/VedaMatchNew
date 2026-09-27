/**
 * Озвучка материала Образования (VED-515) — чистая часть и общий «диктор».
 *
 * Читает браузер (`speechSynthesis`): голос системы, без сети и без платы
 * за синтез. Помощники скопированы из озвучки Блог-ленты (VED-476), а не
 * импортированы: сервисы портала друг друга не импортируют.
 *
 * Диктор один на страницу: включили другой материал — прежний замолкает.
 * Второе нажатие — пауза, третье продолжает с того же места (VED-549).
 */

/**
 * Адреса в тексте (VED-550): `https://…`, `www.…` и голые домены вида
 * `site.ru/путь`; точка или запятая за адресом остаётся тексту. Голосом
 * ссылку не читают — её не набрать на слух. Зона домена — только строчными
 * латинскими буквами или «рф»: так «Бхагавад-гита 2.13» и «т. е.» не
 * считаются адресами. Копия из озвучки Блог-ленты.
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

/**
 * Что читать (VED-550): заголовок и основной текст — у катхи и статьи это
 * `body`, у ссылки на чужой сайт основного текста нет, тогда описание. Без
 * адресов и без служебного: источник, домен и тип голос не читает.
 */
export function buildSpokenEntry(entry: {
  title?: string | null;
  description?: string | null;
  body?: string | null;
}): string {
  const main = entry.body?.trim() || entry.description?.trim() || null;
  return [entry.title, main]
    .map((part) => stripUrls(part ?? ""))
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
    .join(". ")
    .replace(/([.!?…])\.\s/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Язык голоса по буквам, а не по интерфейсу: латинская шлока русским
 * голосом звучит как «кырышна».
 */
export function spokenLanguage(text: string): string {
  return /[Ѐ-ӿ]/.test(text) ? "ru-RU" : "en-US";
}

/**
 * Длинный текст — кусками по фразам. Chrome обрывает одно высказывание
 * через ~15 секунд, а катха бывает на десятки страниц; очередь коротких
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
 * Что делает кнопка озвучки (VED-549): во время чтения — пауза, на паузе —
 * продолжить с того же места, иначе — читать сначала.
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

export function subscribeEntrySpeech(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function getEntrySpeakingId(): string | null {
  return speakingId;
}

export function getEntrySpeakingServerId(): string | null {
  return null;
}

/** Материал, чтение которого стоит на паузе. */
export function getEntryPausedId(): string | null {
  return paused?.id ?? null;
}

export function getEntryPausedServerId(): string | null {
  return null;
}

export function stopEntrySpeech(): void {
  generation += 1;
  paused = null;
  if (canSpeak()) window.speechSynthesis.cancel();
  emit(null);
}

/** Прочитать материал; `false` — читать нечего или браузер не умеет. */
export function speakEntry(id: string, text: string, fromChunk = 0): boolean {
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
export function pauseEntrySpeech(): void {
  if (!speakingId) return;
  const id = speakingId;
  generation += 1;
  if (canSpeak()) window.speechSynthesis.cancel();
  paused = { id, text: currentText, chunk: currentChunk };
  emit(null);
}

/** Продолжить с места паузы; `false` — паузы нет. */
export function resumeEntrySpeech(): boolean {
  if (!paused) return false;
  const { id, text, chunk } = paused;
  return speakEntry(id, text, chunk);
}
