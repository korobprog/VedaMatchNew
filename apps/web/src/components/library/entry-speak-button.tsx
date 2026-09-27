"use client";

import { useRef, useSyncExternalStore } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { useSpeechAnchor } from "@/lib/speech-dock";
import {
  canSpeak,
  getEntryPausedId,
  getEntryPausedServerId,
  getEntrySpeakingId,
  getEntrySpeakingServerId,
  pauseEntrySpeech,
  resumeEntrySpeech,
  SPEECH_SOURCE,
  speakButtonAction,
  speakEntry,
  subscribeEntrySpeech,
} from "./entry-speech";
import { t } from "./i18n";

const subscribeNothing = () => () => {};

/**
 * «Озвучить» (VED-515): материал читает голос браузера. Кнопки нет, где
 * синтеза речи нет, и у материала без слов. Нажатие во время чтения — пауза,
 * следующее продолжает с того же места (VED-549), а не читает сначала.
 */
export function EntrySpeakButton({
  locale,
  entryId,
  text,
  className = "",
}: {
  locale: LibraryLocale;
  entryId: string;
  /** Готовый текст для чтения — `buildSpokenEntry`. */
  text: string;
  className?: string;
}) {
  const speakingId = useSyncExternalStore(
    subscribeEntrySpeech,
    getEntrySpeakingId,
    getEntrySpeakingServerId,
  );
  const pausedId = useSyncExternalStore(
    subscribeEntrySpeech,
    getEntryPausedId,
    getEntryPausedServerId,
  );
  const available = useSyncExternalStore(
    subscribeNothing,
    canSpeak,
    () => false,
  );
  const speaking = speakingId === entryId;
  const paused = pausedId === entryId;

  // Ушли со страницы — чтение не обрывается (VED-569): паузу и стоп человек
  // найдёт в плавающем пульте озвучки. Пока кнопка на экране, пульт спрятан.
  const ref = useRef<HTMLButtonElement>(null);
  useSpeechAnchor(SPEECH_SOURCE, entryId, ref);

  if (!available || !text) return null;
  const label = t(
    locale,
    speaking
      ? "entry.speakPause"
      : paused
        ? "entry.speakResume"
        : "entry.speak",
  );

  function toggle() {
    const action = speakButtonAction({ speaking, paused });
    if (action === "pause") pauseEntrySpeech();
    else if (action === "resume") resumeEntrySpeech();
    else speakEntry(entryId, text);
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      aria-label={label}
      title={label}
      className={`${className} ${speaking || paused ? "border-cyan text-text-0" : ""}`}
    >
      {speaking ? (
        <Pause aria-hidden className="size-4" fill="currentColor" />
      ) : paused ? (
        <Play aria-hidden className="size-4" fill="currentColor" />
      ) : (
        <Volume2 aria-hidden className="size-4" />
      )}
    </button>
  );
}
