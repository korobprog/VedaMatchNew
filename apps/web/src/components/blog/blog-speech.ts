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

// ---------- Диктор ----------

let speakingId: string | null = null;
let listeners: Array<() => void> = [];

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

export function stopBlogSpeech(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
  emit(null);
}

/** Прочитать пост; `false` — читать нечего или браузер не умеет. */
export function speakBlogPost(id: string, text: string): boolean {
  if (!canSpeak() || !text) return false;
  window.speechSynthesis.cancel();
  const chunks = speechChunks(text);
  const lang = spokenLanguage(text);
  chunks.forEach((chunk, at) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = lang;
    const last = at === chunks.length - 1;
    // Кнопка гаснет по концу последнего куска или по ошибке любого, но
    // только если читается всё ещё этот пост, а не уже следующий.
    utterance.onend = () => {
      if (last && speakingId === id) emit(null);
    };
    utterance.onerror = () => {
      if (speakingId === id) emit(null);
    };
    window.speechSynthesis.speak(utterance);
  });
  emit(id);
  return true;
}
