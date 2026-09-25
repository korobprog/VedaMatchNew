/**
 * Озвучка материала Образования (VED-515) — чистая часть и общий «диктор».
 *
 * Читает браузер (`speechSynthesis`): голос системы, без сети и без платы
 * за синтез. Помощники скопированы из озвучки Блог-ленты (VED-476), а не
 * импортированы: сервисы портала друг друга не импортируют.
 *
 * Диктор один на страницу: включили другой материал — прежний замолкает.
 */

/** Что читать: заголовок, описание и текст; пустые части выпадают. */
export function buildSpokenEntry(entry: {
  title?: string | null;
  description?: string | null;
  body?: string | null;
}): string {
  return [entry.title?.trim(), entry.description?.trim(), entry.body?.trim()]
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

// ---------- Диктор ----------

let speakingId: string | null = null;
let listeners: Array<() => void> = [];

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

export function stopEntrySpeech(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
  emit(null);
}

/** Прочитать материал; `false` — читать нечего или браузер не умеет. */
export function speakEntry(id: string, text: string): boolean {
  if (!canSpeak() || !text) return false;
  window.speechSynthesis.cancel();
  const chunks = speechChunks(text);
  const lang = spokenLanguage(text);
  chunks.forEach((chunk, at) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = lang;
    const last = at === chunks.length - 1;
    // Кнопка гаснет по концу последнего куска или по ошибке любого, но
    // только если читается всё ещё этот материал, а не уже следующий.
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
