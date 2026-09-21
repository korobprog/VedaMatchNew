"use client";

import { useEffect, useState } from "react";
import type { ChatGroupCallParticipantDto } from "@vedamatch/shared";
import { ChatAvatar } from "../../chat-avatar";
import { useGroupCalls } from "./group-call-context";
import { peopleLabel } from "./group-call-banner-text";
import { peerStateLabel } from "./group-call-state";

/**
 * Панель группового звонка: состав комнаты, кто говорит, микрофон, выход.
 *
 * Полноэкранная, как и у звонка один на один, но с кнопкой «Свернуть»:
 * комната живёт долго, и запирать человека в ней на всё время разговора
 * незачем — свёрнутая панель превращается в плашку «Вернуться», а звук
 * продолжает играть из провайдера. Выход — только кнопкой «Выйти»:
 * закрыть разговор случайным движением нельзя.
 *
 * Видео здесь нет: этап 1 — только звук. Место под картинку в строке
 * участника оставлено аватаром — когда появится видео, меняется строка, а
 * не устройство панели.
 */

/** Сколько итог висит сам, прежде чем уйти. Отказ так не исчезает. */
const ENDED_AUTOCLOSE_MS = 3000;

export function GroupCallOverlay() {
  const calls = useGroupCalls();
  const phase = calls?.state.phase;
  const error = calls?.state.error ?? null;
  const dismiss = calls?.dismiss;

  // Обычный финал уходит сам; отказ («в звонке уже 4 человека», «нет
  // доступа к микрофону») ждёт, пока его прочитают.
  useEffect(() => {
    if (phase !== "ended" || error || !dismiss) return;
    const timer = setTimeout(dismiss, ENDED_AUTOCLOSE_MS);
    return () => clearTimeout(timer);
  }, [phase, error, dismiss]);

  if (!calls) return null;
  const visible =
    phase === "joining" ||
    phase === "ended" ||
    (phase === "active" && calls.expanded);
  if (!visible) return null;
  return <GroupCallScreen />;
}

function GroupCallScreen() {
  const calls = useGroupCalls()!;
  const { state } = calls;
  const participants = state.call?.participants ?? [];
  const ended = state.phase === "ended";
  const joining = state.phase === "joining";
  const elapsed = useElapsed(state.phase === "active" ? state.joinedAt : null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Групповой звонок"
      className="fixed inset-0 z-[70] flex flex-col bg-bg-0 text-text-0"
    >
      <div className="mx-auto flex w-full max-w-2xl items-start gap-3 px-4 pb-3 pt-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold">Групповой звонок</h2>
          <p aria-live="polite" className="mt-1 text-sm text-text-1">
            {joining
              ? "Входим в звонок…"
              : ended
                ? (state.error ?? "Звонок завершён")
                : `${peopleLabel(participants.length)} · `}
            {!joining && !ended && (
              <span className="font-mono">{elapsed}</span>
            )}
          </p>
          {!joining && !ended && state.call && (
            <p className="mt-1 text-xs text-text-2">
              {`Пока не больше ${state.call.maxParticipants} человек — звук идёт напрямую между собеседниками`}
            </p>
          )}
        </div>
        {state.phase === "active" && (
          <button
            type="button"
            onClick={() => calls.setExpanded(false)}
            className="flex h-11 shrink-0 items-center rounded-full border border-glass-brd bg-glass px-4 text-sm font-semibold text-text-0 hover:bg-bg-2"
          >
            Свернуть
          </button>
        )}
      </div>

      {/* Полоса по центру: на широком экране строка участника во всю
          ширину монитора читается хуже, чем на телефоне. */}
      <div className="scroll-slim mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-4">
        {participants.length === 0 ? (
          // При отказе («уже 4 человека», «нет доступа к микрофону»)
          // причина уже написана выше — «Все вышли из звонка» под ней
          // была бы второй, и неверной, версией случившегося.
          ended && state.error ? null : (
            <p className="px-1 py-6 text-center text-sm text-text-1">
              {ended
                ? "Все вышли из звонка"
                : joining
                  ? "Спрашиваем разрешение на микрофон…"
                  : "Соединяемся…"}
            </p>
          )
        ) : (
          <ul aria-label="Кто в звонке" className="flex flex-col gap-2">
            {participants.map((participant) => (
              <ParticipantRow
                key={participant.user.id}
                participant={participant}
                isSelf={participant.user.id === calls.selfId}
                muted={
                  participant.user.id === calls.selfId
                    ? state.muted
                    : participant.muted
                }
                speaking={state.speaking.includes(participant.user.id)}
                statusLine={
                  participant.user.id === calls.selfId
                    ? null
                    : peerStateLabel(state.peerStates[participant.user.id])
                }
              />
            ))}
          </ul>
        )}
      </div>

      <div
        className="mx-auto flex w-full max-w-2xl items-center justify-center gap-4 px-6 pb-8 pt-2"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        {ended || joining ? (
          <button
            type="button"
            onClick={calls.dismiss}
            className="flex h-12 min-w-[11rem] items-center justify-center rounded-full border border-glass-brd bg-glass px-6 text-sm font-semibold text-text-0 hover:bg-bg-2"
          >
            Закрыть
          </button>
        ) : (
          <>
            <button
              type="button"
              aria-label={
                state.muted ? "Включить микрофон" : "Выключить микрофон"
              }
              aria-pressed={state.muted}
              onClick={calls.toggleMute}
              className={`flex size-14 items-center justify-center rounded-full border border-glass-brd text-text-0 hover:bg-bg-2 ${
                state.muted ? "bg-bg-2" : "bg-glass"
              }`}
            >
              <MicIcon off={state.muted} />
            </button>
            <button
              type="button"
              aria-label="Выйти из звонка"
              onClick={() => void calls.leave()}
              className="flex size-16 items-center justify-center rounded-full bg-magenta text-white shadow-xl hover:opacity-90"
            >
              <LeaveIcon />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ParticipantRow({
  participant,
  isSelf,
  muted,
  speaking,
  statusLine,
}: {
  participant: ChatGroupCallParticipantDto;
  isSelf: boolean;
  muted: boolean;
  speaking: boolean;
  statusLine: string | null;
}) {
  const name = isSelf
    ? `${participant.user.name} (вы)`
    : participant.user.name;
  // Подпись для скринридера собирается словами, а не цветом рамки:
  // «говорит» и «микрофон выключен» иначе не читаются вовсе.
  const spoken = [
    name,
    participant.host ? "хозяин звонка" : null,
    muted ? "микрофон выключен" : null,
    speaking ? "говорит" : null,
    statusLine,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <li
      aria-label={spoken}
      className={`flex items-center gap-3 rounded-2xl border bg-bg-1 px-3 py-2.5 ${
        speaking ? "border-cyan" : "border-glass-brd"
      }`}
    >
      <ChatAvatar
        kind="direct"
        user={participant.user}
        title={participant.user.name}
        size={44}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-0">{name}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-text-1">
          {speaking && !statusLine && (
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-cyan motion-safe:animate-pulse"
            />
          )}
          {statusLine ??
            (speaking
              ? "Говорит"
              : participant.host
                ? "Хозяин звонка"
                : "В звонке")}
        </p>
      </div>
      {muted && (
        <span
          aria-hidden
          title="Микрофон выключен"
          className="shrink-0 text-text-1"
        >
          <MicIcon off size={20} />
        </span>
      )}
    </li>
  );
}

/** Длительность своего участия — от входа, а не от начала комнаты. */
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

function MicIcon({ off, size = 24 }: { off: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
      <path d="M3 21L21 3" />
    </svg>
  );
}
