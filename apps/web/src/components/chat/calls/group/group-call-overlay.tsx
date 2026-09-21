"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatGroupCallParticipantDto } from "@vedamatch/shared";
import { ChatAvatar } from "../../chat-avatar";
import { useGroupCalls } from "./group-call-context";
import { peopleLabel } from "./group-call-banner-text";
import { peerStateLabel } from "./group-call-state";
import {
  cameraButtonState,
  camerasOn,
  videoTiles,
} from "./group-video-state";
import { videoGridLayout } from "./video-grid";

/**
 * Панель группового звонка: состав комнаты, кто говорит, микрофон, выход.
 *
 * Полноэкранная, как и у звонка один на один, но с кнопкой «Свернуть»:
 * комната живёт долго, и запирать человека в ней на всё время разговора
 * незачем — свёрнутая панель превращается в плашку «Вернуться», а звук
 * продолжает играть из провайдера. Выход — только кнопкой «Выйти»:
 * закрыть разговор случайным движением нельзя.
 *
 * Панель показывает одно из двух и переключается сама (VED-293, этап 4):
 *
 * - **сетка плиток**, когда в комнате включена хоть одна камера. Раскладка —
 *   `video-grid.ts`, та же, что в приложении; плитка без картинки — аватар,
 *   а не чёрный прямоугольник, который читается как поломка связи;
 * - **список строк**, пока разговор идёт голосом. Строка вмещает больше
 *   сведений (хозяин, кто говорит, состояние связи), и в звонке без видео
 *   она полезнее четырёх пустых плиток.
 *
 * Кнопка «камера» гаснет, когда мест под видео не осталось, но остаётся
 * нажимаемой и объясняет причину словами. Настоящее решение — за сервером
 * (`group-call-video.ts`), он же присылает текст отказа.
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
  const showsGrid = !ended && !joining && camerasOn(state.call) > 0;
  const camera = cameraButtonState(state.call, calls.selfId, calls.cameraOn);

  /** Плитки комнаты — что в какой, решает `group-video-state.ts`. */
  function VideoGrid() {
    const tiles = videoTiles({
      call: state.call,
      selfId: calls.selfId,
      sendingVideo: calls.sendingVideo,
      remoteStreams: new Set(Object.keys(calls.remoteStreams)),
      remoteVideoOff: new Set(
        Object.entries(calls.remoteVideoOff)
          .filter(([, off]) => off)
          .map(([userId]) => userId),
      ),
    });
    // Панель на сайте всегда широкая — плитки встают вдоль, см. `video-grid.ts`.
    const layout = videoGridLayout(tiles.length, true);
    const byId = new Map(participants.map((p) => [p.user.id, p]));

    return (
      <ul
        aria-label="Кто в звонке"
        className="grid flex-1 gap-2"
        style={{
          gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
        }}
      >
        {tiles.map((tile) => {
          const participant = byId.get(tile.userId);
          if (!participant) return null;
          const muted = tile.isSelf ? state.muted : participant.muted;
          const stream = tile.isSelf
            ? calls.localVideoStream
            : (calls.remoteStreams[tile.userId] ?? null);
          const speaking = state.speaking.includes(tile.userId);
          return (
            <li
              key={tile.userId}
              aria-label={spokenLabel({
                participant,
                isSelf: tile.isSelf,
                muted,
                speaking,
                statusLine: tile.isSelf
                  ? null
                  : peerStateLabel(state.peerStates[tile.userId]),
                cameraOff: tile.view === "avatar",
              })}
              className={`relative flex min-h-32 items-end overflow-hidden rounded-2xl border bg-bg-1 ${
                speaking ? "border-cyan" : "border-glass-brd"
              }`}
            >
              {tile.view === "video" && stream ? (
                <VideoTile stream={stream} mirrored={tile.isSelf} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <ChatAvatar
                    kind="direct"
                    user={participant.user}
                    title={participant.user.name}
                    size={layout.rows > 1 ? 56 : 72}
                  />
                </div>
              )}
              <p className="relative flex w-full items-center gap-1.5 bg-glass px-3 py-1.5 text-xs font-semibold text-text-0">
                <span className="truncate">
                  {tile.isSelf
                    ? `${participant.user.name} (вы)`
                    : participant.user.name}
                </span>
                {muted && (
                  <span aria-hidden className="shrink-0 text-text-1">
                    <MicIcon off size={16} />
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    );
  }

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
          ширину монитора читается хуже, чем на телефоне. Сетка плиток
          шире — картинке ширина идёт на пользу. */}
      <div
        className={`scroll-slim mx-auto flex w-full flex-1 flex-col overflow-y-auto px-4 pb-4 ${
          showsGrid ? "max-w-5xl" : "max-w-2xl"
        }`}
      >
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
        ) : showsGrid ? (
          <VideoGrid />
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

      {state.actionError && (
        <div className="mx-auto w-full max-w-2xl px-4 pb-2">
          <button
            type="button"
            aria-live="polite"
            onClick={calls.clearActionError}
            className="flex min-h-11 w-full items-center rounded-2xl border border-glass-brd bg-bg-1 px-4 py-2.5 text-left text-sm text-text-0 hover:bg-bg-2"
          >
            {state.actionError}
          </button>
        </div>
      )}

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

            {/* Кнопка остаётся НАЖИМАЕМОЙ, даже когда мест нет: иначе
                четвёртый жмёт в мёртвую кнопку и не понимает, почему.
                Нажатие объясняет причину словами — их присылает сервер.
                `disabled` здесь был бы хуже вдвойне: отключённая кнопка не
                получает фокус, и скринридер про причину не узнает вовсе. */}
            <button
              type="button"
              aria-label={
                camera.blocked
                  ? `Включить камеру нельзя: ${camera.blockedReason}`
                  : calls.cameraOn
                    ? "Выключить камеру"
                    : "Включить камеру"
              }
              aria-pressed={calls.cameraOn}
              onClick={() => void calls.toggleCamera()}
              className={`flex size-14 items-center justify-center rounded-full border border-glass-brd text-text-0 hover:bg-bg-2 ${
                calls.cameraOn ? "bg-bg-2" : "bg-glass"
              } ${camera.blocked ? "opacity-60" : ""}`}
            >
              <CameraIcon off={!calls.cameraOn} />
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

/**
 * Картинка собеседника. `<video>` получает поток свойством `srcObject`,
 * которое в JSX не выставить, — отсюда `ref`.
 *
 * `muted` на элементе обязателен: звук этой комнаты играет `GroupCallAudio`
 * (по `<audio>` на человека, живут в провайдере и переживают сворачивание
 * панели). Без `muted` каждый голос звучал бы дважды, а своя плитка ещё и
 * дала бы эхо. `playsInline` — чтобы Safari на телефоне не разворачивал
 * видео на весь экран поверх панели.
 */
function VideoTile({
  stream,
  mirrored,
}: {
  stream: MediaStream;
  mirrored: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || element.srcObject === stream) return;
    element.srcObject = stream;
    void element.play().catch(() => {
      // Автовоспроизведение без звука браузеры разрешают; если всё же
      // отказали, картинка появится с первым же нажатием в панели.
    });
  }, [stream]);

  return (
    <video
      ref={ref}
      muted
      autoPlay
      playsInline
      aria-hidden
      // Свою камеру показываем зеркально: человек привык видеть себя
      // таким, каким его показывает зеркало.
      className={`absolute inset-0 size-full object-cover ${mirrored ? "-scale-x-100" : ""}`}
    />
  );
}

/**
 * Подпись для скринридера собирается словами, а не цветом рамки и не
 * значком: «говорит», «микрофон выключен», «камера выключена» иначе не
 * читаются вовсе.
 */
function spokenLabel({
  participant,
  isSelf,
  muted,
  speaking,
  statusLine,
  cameraOff,
}: {
  participant: ChatGroupCallParticipantDto;
  isSelf: boolean;
  muted: boolean;
  speaking: boolean;
  statusLine: string | null;
  cameraOff: boolean;
}): string {
  return [
    isSelf ? `${participant.user.name} (вы)` : participant.user.name,
    participant.host ? "хозяин звонка" : null,
    cameraOff ? "камера выключена" : null,
    muted ? "микрофон выключен" : null,
    speaking ? "говорит" : null,
    statusLine,
  ]
    .filter(Boolean)
    .join(", ");
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

  return (
    <li
      aria-label={spokenLabel({
        participant,
        isSelf,
        muted,
        speaking,
        statusLine,
        cameraOff: false,
      })}
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

function CameraIcon({ off, size = 24 }: { off: boolean; size?: number }) {
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
      <rect x="2" y="6" width="13" height="12" rx="3" />
      <path d="M15 10.5 21 7v10l-6-3.5z" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
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
