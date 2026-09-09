"use client";

import { useEffect, useRef, useState } from "react";
import { ChatAvatar } from "../chat-avatar";
import { companionOf, endedLabel, roleIn } from "./call-machine";
import { useChatCalls } from "./call-provider";

/**
 * Экран звонка: исходящий, соединение, разговор, финал. Полноэкранный —
 * во время разговора ничего другого на экране быть не должно, а видео
 * собеседника иначе некуда положить.
 */
export function CallOverlay() {
  const calls = useChatCalls();
  const phase = calls?.state.phase;
  const visible =
    Boolean(calls?.state.call) &&
    (phase === "outgoing" ||
      phase === "connecting" ||
      phase === "active" ||
      phase === "ended");
  const idleError = calls && phase === "idle" && calls.state.error;

  if (idleError)
    return (
      <div
        role="status"
        className="fixed inset-x-0 bottom-20 z-[60] mx-auto w-[min(26rem,calc(100%-1.5rem))] rounded-2xl border border-glass-brd bg-bg-1 px-4 py-3 text-sm text-text-0 shadow-2xl"
      >
        {calls.state.error}
      </div>
    );

  if (!calls || !visible || !calls.state.call) return null;
  return <CallScreen />;
}

function CallScreen() {
  const calls = useChatCalls()!;
  const { state, selfId, localStream, remoteStream } = calls;
  const call = state.call!;
  const companion = companionOf(call, selfId);
  const role = roleIn(state, selfId);
  const isVideo = call.kind === "video";

  const remoteRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);
  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
  }, [localStream]);

  const elapsed = useElapsed(state.phase === "active" ? state.connectedAt : null);

  const statusLine =
    state.phase === "outgoing"
      ? "Вызов…"
      : state.phase === "connecting"
        ? "Соединение…"
        : state.phase === "ended"
          ? endedLabel(state.endedStatus, role)
          : state.reconnecting
            ? "Переподключение…"
            : elapsed;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${isVideo ? "Видеозвонок" : "Аудиозвонок"}: ${companion.name}`}
      className="fixed inset-0 z-[70] flex flex-col bg-bg-0 text-text-0"
    >
      {/* Звук идёт через отдельный <audio>: у аудиозвонка <video> нет. */}
      <audio ref={remoteAudioRef} autoPlay playsInline hidden={isVideo} />

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {isVideo && remoteStream && state.phase === "active" ? (
          <video
            ref={remoteRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <ChatAvatar kind="direct" user={companion} title={companion.name} size={112} />
            <h2 className="font-display text-2xl font-bold">{companion.name}</h2>
          </div>
        )}

        {isVideo && localStream && state.phase !== "ended" && (
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className={`absolute right-3 top-3 w-28 rounded-2xl border border-glass-brd bg-bg-2 object-cover shadow-xl sm:w-40 ${
              state.cameraOff ? "opacity-0" : ""
            }`}
            style={{ aspectRatio: "3 / 4" }}
          />
        )}
      </div>

      <div
        className="flex flex-col items-center gap-5 px-6 pb-8 pt-4"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        <p
          aria-live="polite"
          className={`font-mono text-sm ${
            state.phase === "ended" || state.reconnecting ? "text-text-1" : "text-text-2"
          }`}
        >
          {statusLine}
          {state.phase === "ended" && state.error ? ` · ${state.error}` : ""}
        </p>

        {state.phase === "ended" ? (
          <button
            type="button"
            onClick={calls.dismiss}
            className="rounded-full border border-glass-brd bg-glass px-6 py-2.5 text-sm font-semibold"
          >
            Закрыть
          </button>
        ) : (
          <div className="flex items-center gap-4">
            <ControlButton
              label={state.muted ? "Включить микрофон" : "Выключить микрофон"}
              pressed={state.muted}
              onClick={calls.toggleMute}
            >
              <MicIcon off={state.muted} />
            </ControlButton>
            {isVideo && (
              <ControlButton
                label={state.cameraOff ? "Включить камеру" : "Выключить камеру"}
                pressed={state.cameraOff}
                onClick={calls.toggleCamera}
              >
                <CameraIcon off={state.cameraOff} />
              </ControlButton>
            )}
            <button
              type="button"
              aria-label="Завершить звонок"
              onClick={() => void calls.hangUp()}
              className="flex size-16 items-center justify-center rounded-full bg-magenta text-white shadow-xl hover:opacity-90"
            >
              <HangUpIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function useElapsed(since: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  if (!since) return "0:00";
  const total = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

function ControlButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex size-14 items-center justify-center rounded-full border border-glass-brd ${
        pressed ? "bg-white/20 text-text-0" : "bg-glass text-text-0"
      } hover:bg-white/10`}
    >
      {children}
    </button>
  );
}

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

function CameraIcon({ off }: { off: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="13" height="10" rx="2" />
      <path d="M16 11l5-3v8l-5-3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

function HangUpIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 13c5-5 13-5 18 0l-2.5 2.5a1.5 1.5 0 0 1-1.8.3L14 14.5v-2.2a10 10 0 0 0-4 0v2.2l-2.7 1.3a1.5 1.5 0 0 1-1.8-.3z" />
    </svg>
  );
}
