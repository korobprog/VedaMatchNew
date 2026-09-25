"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Square, Volume2 } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import {
  canSpeak,
  getEntrySpeakingId,
  getEntrySpeakingServerId,
  speakEntry,
  stopEntrySpeech,
  subscribeEntrySpeech,
} from "./entry-speech";
import { t } from "./i18n";

const subscribeNothing = () => () => {};

/**
 * «Озвучить» (VED-515): материал читает голос браузера. Кнопки нет, где
 * синтеза речи нет, и у материала без слов. Нажатие во время чтения — «Стоп».
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
  const available = useSyncExternalStore(
    subscribeNothing,
    canSpeak,
    () => false,
  );
  const speaking = speakingId === entryId;

  // Ушли со страницы — голос не должен читать в пустоту.
  useEffect(
    () => () => {
      if (getEntrySpeakingId() === entryId) stopEntrySpeech();
    },
    [entryId],
  );

  if (!available || !text) return null;
  const label = t(locale, speaking ? "entry.speakStop" : "entry.speak");

  return (
    <button
      type="button"
      onClick={() => (speaking ? stopEntrySpeech() : speakEntry(entryId, text))}
      aria-pressed={speaking}
      aria-label={label}
      title={label}
      className={`${className} ${speaking ? "border-cyan text-text-0" : ""}`}
    >
      {speaking ? (
        <Square aria-hidden className="size-4" fill="currentColor" />
      ) : (
        <Volume2 aria-hidden className="size-4" />
      )}
    </button>
  );
}
