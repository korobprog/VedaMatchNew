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
}: {
  conversationId: string;
  onRecorded: (attachment: ChatAttachmentInput) => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const levelsRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);

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
    } catch {
      onError("Микрофон недоступен");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  return (
    <button
      type="button"
      onClick={() => (recording ? stop() : void start())}
      disabled={busy}
      aria-label={recording ? "Остановить запись" : "Записать голосовое"}
      aria-pressed={recording}
      className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border transition-colors disabled:opacity-60 ${
        recording
          ? "border-cyan/40 bg-cyan/15 text-cyan"
          : "border-mint-edge bg-mint text-on-mint"
      }`}
    >
      {recording ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
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
      )}
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
