"use client";

import { useRef, useState } from "react";
import type { ChatAttachmentInput } from "@vedamatch/shared";
import { uploadChatFile } from "@/lib/chat-client";

/**
 * Запись голосового. Волна считается прямо во время записи и уезжает вместе
 * с файлом: разбирать звук при каждом открытии переписки ради картинки —
 * это тянуть все голосовые целиком.
 */
const WAVEFORM_POINTS = 40;

export function ChatVoiceRecorder({
  conversationId,
  onRecorded,
  onError,
  onRecordingChange,
}: {
  conversationId: string;
  onRecorded: (attachment: ChatAttachmentInput) => void;
  onError: (message: string) => void;
  /** Композер прячет текстовое поле и показывает таймер записи вместо него. */
  onRecordingChange?: (recording: boolean, elapsedSec: number) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const levelsRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const tickRef = useRef<number | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      levelsRef.current = [];
      startedAtRef.current = Date.now();

      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const sample = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        // Среднее отклонение от тишины (128) — достаточно для столбика.
        let sum = 0;
        for (const value of data) sum += Math.abs(value - 128);
        levelsRef.current.push(
          Math.min(100, Math.round((sum / data.length) * 3)),
        );
      }, 120);

      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = async () => {
        window.clearInterval(sample);
        void context.close();
        stream.getTracks().forEach((track) => track.stop());

        if (cancelledRef.current) {
          cancelledRef.current = false;
          return;
        }

        const blob = new Blob(chunks, { type: "audio/webm" });
        const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        setBusy(true);
        try {
          const stored = await uploadChatFile(
            conversationId,
            new File([blob], "voice.webm", { type: "audio/webm" }),
          );
          onRecorded({
            kind: "voice",
            url: stored.url,
            key: stored.key,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            durationSec: seconds,
            waveform: compress(levelsRef.current),
          });
        } catch (error) {
          onError(
            error instanceof Error ? error.message : "Голосовое не отправилось",
          );
        } finally {
          setBusy(false);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      onRecordingChange?.(true, 0);
      tickRef.current = window.setInterval(() => {
        onRecordingChange?.(
          true,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        );
      }, 1000);
    } catch {
      onError("Микрофон недоступен");
    }
  }

  function stopTicking() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    stopTicking();
    onRecordingChange?.(false, 0);
  }

  /** Отменяет запись без отправки — голосовое никуда не уезжает. */
  function cancel() {
    cancelledRef.current = true;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    stopTicking();
    onRecordingChange?.(false, 0);
  }

  if (recording)
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={cancel}
          aria-label="Отменить запись"
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-glass-brd bg-glass text-text-1 transition-colors hover:text-magenta"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 6h18" />
            <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" />
            <path d="M19 6l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={busy}
          aria-label="Остановить и отправить запись"
          aria-pressed
          className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl border border-magenta/40 bg-magenta/15 text-magenta transition-colors disabled:opacity-60"
        >
          <span className="absolute inset-0 animate-ping rounded-2xl bg-magenta/30" />
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="relative"
            aria-hidden
          >
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      </span>
    );

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={busy}
      aria-label="Записать голосовое"
      aria-pressed={false}
      className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-mint-edge bg-mint text-on-mint transition-colors disabled:opacity-60"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0013 0" />
        <path d="M12 17.5V21" />
      </svg>
    </button>
  );
}

/** Сжимает измерения до сорока столбиков: больше на экране не различить. */
function compress(levels: number[]): number[] {
  if (levels.length <= WAVEFORM_POINTS) return levels;
  const step = levels.length / WAVEFORM_POINTS;
  return Array.from({ length: WAVEFORM_POINTS }, (_, index) => {
    const slice = levels.slice(
      Math.floor(index * step),
      Math.max(Math.floor((index + 1) * step), Math.floor(index * step) + 1),
    );
    return Math.round(slice.reduce((sum, x) => sum + x, 0) / slice.length);
  });
}
