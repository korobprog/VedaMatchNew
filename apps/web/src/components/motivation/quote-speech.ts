/**
 * «Диктор» ленты Вдохновения: одно чтение на страницу, пауза и продолжение
 * с того же места (VED-549).
 *
 * Пауза — не `speechSynthesis.pause()`: Chrome на Android её не умеет и
 * обрывает речь. Поэтому на паузе чтение отменяется, а запоминается кусок
 * (фраза), на котором остановились, — продолжение читает с него. Устройство
 * скопировано из озвучки Блог-ленты, а не импортировано: сервисы портала
 * друг друга не импортируют.
 */
import { canSpeak, spokenLanguage } from "./speak-quote";

/**
 * Текст кусками по фразам: по ним паузу продолжают с места, и Chrome не
 * обрывает длинное высказывание через ~15 секунд. Фраза длиннее предела
 * режется по словам.
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

/** Во время чтения — пауза, на паузе — продолжить, иначе — читать сначала. */
export function speakButtonAction(state: {
  speaking: boolean;
  paused: boolean;
}): "pause" | "resume" | "start" {
  if (state.speaking) return "pause";
  if (state.paused) return "resume";
  return "start";
}

let speakingId: string | null = null;
let listeners: Array<() => void> = [];
let paused: { id: string; text: string; chunk: number } | null = null;
let currentText = "";
let currentChunk = 0;
/** Поколение чтения: обработчики отменённых фраз не трогают новое. */
let generation = 0;

function emit(next: string | null) {
  speakingId = next;
  for (const listener of listeners) listener();
}

export function subscribeQuoteSpeech(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function getQuoteSpeakingId(): string | null {
  return speakingId;
}

/** Публикация, чтение которой стоит на паузе. */
export function getQuotePausedId(): string | null {
  return paused?.id ?? null;
}

export function getQuoteSpeechServerSnapshot(): string | null {
  return null;
}

export function stopQuoteSpeech(): void {
  generation += 1;
  paused = null;
  if (canSpeak()) window.speechSynthesis.cancel();
  emit(null);
}

/** Прочитать цитату; `false` — читать нечего или браузер не умеет. */
export function speakQuote(id: string, text: string, fromChunk = 0): boolean {
  if (!canSpeak() || !text) return false;
  generation += 1;
  const own = generation;
  paused = null;
  window.speechSynthesis.cancel();
  const chunks = speechChunks(text);
  if (chunks.length === 0) return false;
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
export function pauseQuoteSpeech(): void {
  if (!speakingId) return;
  const id = speakingId;
  generation += 1;
  if (canSpeak()) window.speechSynthesis.cancel();
  paused = { id, text: currentText, chunk: currentChunk };
  emit(null);
}

/** Продолжить с места паузы; `false` — паузы нет. */
export function resumeQuoteSpeech(): boolean {
  if (!paused) return false;
  const { id, text, chunk } = paused;
  return speakQuote(id, text, chunk);
}
