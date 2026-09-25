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

/** Что читать: заголовок и текст, пустые части выпадают. */
export function buildSpokenPost(post: {
  title?: string | null;
  text?: string | null;
}): string {
  return [post.title?.trim(), post.text?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(". ")
    .replace(/https?:\/\/\S+/g, "ссылка")
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
