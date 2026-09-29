"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Square, Volume2 } from "lucide-react";

const subscribeNothing = () => () => {};
const canSpeak = () =>
  typeof window !== "undefined" && "speechSynthesis" in window;

/** Кто сейчас читает вслух — чтобы у остальных кнопок был «стоп», а не «играть». */
let current: string | null = null;
const listeners = new Set<() => void>();
function setCurrent(id: string | null) {
  current = id;
  for (const listener of listeners) listener();
}

/**
 * «Озвучить» раздел стиха (VED-683): транслитерацию или пословный перевод
 * читает голос браузера. Одновременно звучит один раздел; повторное
 * нажатие — стоп. Кнопки нет, где синтеза речи нет.
 */
export function BlockSpeakButton({
  id,
  text,
  label,
}: {
  id: string;
  text: string;
  label: string;
}) {
  const available = useSyncExternalStore(
    subscribeNothing,
    canSpeak,
    () => false,
  );
  const [speakingId, setSpeakingId] = useState<string | null>(current);

  useEffect(() => {
    const update = () => setSpeakingId(current);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  if (!available || !text.trim()) return null;
  const speaking = speakingId === id;

  function toggle() {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (speaking) {
      setCurrent(null);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ru-RU";
    utterance.onend = () => {
      if (current === id) setCurrent(null);
    };
    utterance.onerror = utterance.onend;
    setCurrent(id);
    synth.speak(utterance);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      aria-label={speaking ? `Остановить: ${label}` : `Озвучить: ${label}`}
      title={speaking ? "Остановить" : "Озвучить"}
      className="reader-muted reader-bordered reader-hover inline-flex size-8 flex-none items-center justify-center rounded-lg border"
    >
      {speaking ? (
        <Square aria-hidden className="size-3.5" />
      ) : (
        <Volume2 aria-hidden className="size-4" />
      )}
    </button>
  );
}
