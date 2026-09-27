"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import { fetchLibraryEntry } from "@/lib/library-client-api";
import {
  buildSpokenPost,
  canSpeak,
  getBlogPausedId,
  getBlogPausedServerId,
  getBlogSpeakingId,
  getBlogSpeakingServerId,
  libraryEntryIdOf,
  pauseBlogSpeech,
  resolveSpokenPostText,
  resumeBlogSpeech,
  speakBlogPost,
  speakButtonAction,
  stopBlogSpeech,
  subscribeBlogSpeech,
  type SpokenLibraryEntry,
} from "./blog-speech";

const subscribeNothing = () => () => {};

/** Что читает кнопка: пост или оригинал репоста. */
export interface SpokenPostSource {
  title?: string | null;
  text?: string | null;
  link?: { url: string } | null;
}

/**
 * Материал Образования подгружается один раз за страницу: повторное
 * «Озвучить» того же поста не ходит в сеть.
 */
const entryCache = new Map<string, Promise<SpokenLibraryEntry | null>>();
function loadSpokenEntry(id: string): Promise<SpokenLibraryEntry | null> {
  let pending = entryCache.get(id);
  if (!pending) {
    pending = fetchLibraryEntry(id);
    entryCache.set(id, pending);
    // Неудачу не запоминаем: сеть вернётся — прочитаем материал.
    void pending.then((entry) => {
      if (!entry) entryCache.delete(id);
    });
  }
  return pending;
}

/**
 * Озвучка поста Блог-ленты: одно поведение у кнопки под постом и у значка
 * на главной. Первое нажатие — читать, во время чтения — пауза (VED-514,
 * VED-549), на паузе — продолжить с того же места.
 *
 * Пост, присланный из Образования, читается текстом самого материала, а не
 * своей ссылкой (VED-550): текст подгружается у Образования по его
 * публичному API в момент нажатия. Лента таблиц Образования не читает.
 */
export function useBlogSpeech(
  id: string | null,
  source: SpokenPostSource | null,
) {
  const speakingId = useSyncExternalStore(
    subscribeBlogSpeech,
    getBlogSpeakingId,
    getBlogSpeakingServerId,
  );
  const pausedId = useSyncExternalStore(
    subscribeBlogSpeech,
    getBlogPausedId,
    getBlogPausedServerId,
  );
  const supported = useSyncExternalStore(
    subscribeNothing,
    canSpeak,
    () => false,
  );
  const [loading, setLoading] = useState(false);

  const ownText = source ? buildSpokenPost(source) : "";
  const fromLibrary = source ? libraryEntryIdOf(source) !== null : false;
  const speaking = id !== null && speakingId === id;
  const paused = id !== null && pausedId === id;

  async function toggle() {
    if (!id || !source || loading) return;
    const action = speakButtonAction({ speaking, paused });
    if (action === "pause") {
      pauseBlogSpeech();
      return;
    }
    if (action === "resume") {
      resumeBlogSpeech();
      return;
    }
    if (!fromLibrary) {
      speakBlogPost(id, ownText);
      return;
    }
    setLoading(true);
    try {
      speakBlogPost(id, await resolveSpokenPostText(source, loadSpokenEntry));
    } finally {
      setLoading(false);
    }
  }

  return {
    available: supported && (Boolean(ownText) || fromLibrary),
    speaking,
    paused,
    loading,
    toggle,
  };
}

/**
 * «Слушать» под постом (VED-476). Кнопки нет, где синтеза речи нет, и у
 * поста без текста.
 */
export function BlogSpeakButton({
  postId,
  source,
  className = "",
  labelClassName = "",
}: {
  postId: string;
  source: SpokenPostSource;
  className?: string;
  labelClassName?: string;
}) {
  const { available, speaking, paused, loading, toggle } = useBlogSpeech(
    postId,
    source,
  );

  // Карточка ушла со страницы — голос не должен читать в пустоту, а пауза
  // не должна ждать продолжения у кнопки, которой нет.
  useEffect(
    () => () => {
      if (getBlogSpeakingId() === postId || getBlogPausedId() === postId) {
        stopBlogSpeech();
      }
    },
    [postId],
  );

  if (!available) return null;
  const caption = speaking ? "Пауза" : paused ? "Продолжить" : "Слушать";

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={loading}
      aria-busy={loading}
      aria-pressed={speaking}
      aria-label={
        speaking
          ? "Пауза озвучки"
          : paused
            ? "Продолжить озвучку"
            : "Слушать пост"
      }
      className={`${className} ${speaking || paused ? "border-cyan" : ""}`}
    >
      {speaking ? (
        <Pause aria-hidden className="size-3.5" fill="currentColor" />
      ) : paused ? (
        <Play aria-hidden className="size-3.5" fill="currentColor" />
      ) : (
        <Volume2 aria-hidden className="size-3.5" />
      )}
      <span className={labelClassName}>{caption}</span>
    </button>
  );
}
