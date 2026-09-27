"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatGroupCallParticipantDto } from "@vedamatch/shared";
import { ChatAvatar } from "../../chat-avatar";
import { useGroupCalls, type GroupCallsApi } from "./group-call-context";
import { peopleLabel } from "./group-call-banner-text";
import { peerStateLabel } from "./group-call-state";
import {
  cameraButtonState,
  camerasOn,
  videoTiles,
  type Tile,
} from "./group-video-state";
import { screenButtonState, screenSharer } from "./screen-share";
import { splitStage, stageStrip, videoGridLayout } from "./video-grid";

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
 *
 * Показ экрана (VED-360): кнопка есть только там, где браузер умеет
 * `getDisplayMedia` (не на телефоне). Чужой экран встаёт на «сцену» —
 * крупно, целиком (`object-contain`), остальные полосой; нажатие на
 * «Во весь экран» разворачивает его на весь монитор.
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
  const screen = screenButtonState(state.call, calls.selfId, {
    sharing: calls.screenOn,
    supported: calls.screenSupported,
  });
  const sharer = screenSharer(state.call);
  const wide = useWideViewport();

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
          {/* Начало и конец чужого показа проговариваются: плитка на сцене
              сама по себе скринридеру ничего не скажет. */}
          <p aria-live="polite" className="mt-1 text-sm text-text-1">
            {!joining && !ended && sharer
              ? sharer.id === calls.selfId
                ? "Вы показываете экран"
                : `${sharer.name} показывает экран`
              : ""}
          </p>
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
          <VideoGrid calls={calls} participants={participants} wide={wide} />
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

      {calls.screenOn && !ended && (
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-2">
          <p className="min-w-0 flex-1 text-sm text-text-0">
            Остальные видят ваш экран
          </p>
          <button
            type="button"
            onClick={() => void calls.toggleScreenShare()}
            className="flex h-11 shrink-0 items-center rounded-full border-2 border-magenta bg-bg-1 px-4 text-sm font-semibold text-text-0 hover:bg-bg-2"
          >
            Остановить показ
          </button>
        </div>
      )}

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
                // Во время показа экрана кнопка решает, вернётся ли камера
                // после него: в отправителе сейчас экран.
                calls.screenOn
                  ? calls.cameraOn
                    ? "Не включать камеру после показа экрана"
                    : "Включить камеру после показа экрана"
                  : camera.blocked
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

            {/* Как и камера, погашенная кнопка остаётся нажимаемой и
                объясняет причину, — но окно выбора экрана при этом не
                открывается: выбрать окно и только потом услышать «нельзя»
                обиднее, чем услышать сразу. */}
            {screen.visible && (
              <button
                type="button"
                aria-label={
                  screen.blocked
                    ? `Показать экран нельзя: ${screen.blockedReason}`
                    : calls.screenOn
                      ? "Остановить показ экрана"
                      : "Показать экран"
                }
                aria-pressed={calls.screenOn}
                onClick={() => void calls.toggleScreenShare()}
                className={`flex size-14 items-center justify-center rounded-full border border-glass-brd text-text-0 hover:bg-bg-2 ${
                  calls.screenOn ? "bg-bg-2" : "bg-glass"
                } ${screen.blocked ? "opacity-60" : ""}`}
              >
                <ScreenIcon active={calls.screenOn} />
              </button>
            )}

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
 * Плитки комнаты — что в какой, решает `group-video-state.ts`.
 *
 * Компонент верхнего уровня, а не функция внутри панели: объявленный в теле
 * другого компонента, он пересоздавался бы на каждую отрисовку, и React
 * сбрасывал бы состояние каждой плитки — то есть `<video>` терял бы
 * `srcObject` и картинка моргала бы на каждое событие комнаты.
 *
 * Когда кто-то показывает экран, раскладка — «сцена» (`splitStage`):
 * экран крупно, остальные полосой сбоку или снизу (`stageStrip`).
 */
function VideoGrid({
  calls,
  participants,
  wide,
}: {
  calls: GroupCallsApi;
  participants: ChatGroupCallParticipantDto[];
  wide: boolean;
}) {
  const { state } = calls;
  const tiles = videoTiles({
    call: state.call,
    selfId: calls.selfId,
    sendingVideo: calls.sendingVideo,
    sharingScreen: calls.screenOn,
    remoteStreams: new Set(Object.keys(calls.remoteStreams)),
    remoteVideoOff: new Set(
      Object.entries(calls.remoteVideoOff)
        .filter(([, off]) => off)
        .map(([userId]) => userId),
    ),
  });
  const byId = new Map(participants.map((p) => [p.user.id, p]));
  const { stage, strip } = splitStage(tiles);

  if (stage) {
    const stripAt = stageStrip(strip.length, wide);
    return (
      <div
        className={`flex flex-1 gap-2 ${
          stripAt === "side" ? "flex-row" : "flex-col"
        }`}
      >
        <StageTile
          calls={calls}
          tile={stage}
          participant={byId.get(stage.userId)}
        />
        {stripAt !== "none" && (
          <ul
            aria-label="Остальные в звонке"
            className={`flex shrink-0 gap-2 ${
              stripAt === "side"
                ? "w-44 flex-col lg:w-56"
                : "h-28 flex-row sm:h-32"
            }`}
          >
            {strip.map((tile) => (
              <ParticipantTile
                key={tile.userId}
                calls={calls}
                tile={tile}
                participant={byId.get(tile.userId)}
                compact
                className="min-h-0 min-w-0 flex-1"
              />
            ))}
          </ul>
        )}
      </div>
    );
  }

  const layout = videoGridLayout(tiles.length, wide);
  return (
    <ul
      aria-label="Кто в звонке"
      className="grid flex-1 gap-2"
      style={{
        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
      }}
    >
      {tiles.map((tile) => (
        <ParticipantTile
          key={tile.userId}
          calls={calls}
          tile={tile}
          participant={byId.get(tile.userId)}
          compact={layout.rows > 1}
          className="min-h-32"
        />
      ))}
    </ul>
  );
}

/** Одна плитка: картинка или аватар, подпись с именем и микрофоном. */
function ParticipantTile({
  calls,
  tile,
  participant,
  compact,
  className,
}: {
  calls: GroupCallsApi;
  tile: Tile;
  participant: ChatGroupCallParticipantDto | undefined;
  compact: boolean;
  className: string;
}) {
  const { state } = calls;
  if (!participant) return null;
  const muted = tile.isSelf ? state.muted : participant.muted;
  const stream = tileStream(calls, tile);
  const speaking = state.speaking.includes(tile.userId);
  return (
    <li
      aria-label={spokenLabel({
        participant,
        isSelf: tile.isSelf,
        muted,
        speaking,
        statusLine: tile.isSelf
          ? null
          : peerStateLabel(state.peerStates[tile.userId]),
        cameraOff: tile.view === "avatar",
        screen: tile.screen,
      })}
      className={`relative flex items-end overflow-hidden rounded-2xl border bg-bg-1 ${
        speaking ? "border-cyan" : "border-glass-brd"
      } ${className}`}
    >
      {tile.view === "video" && stream ? (
        <VideoTile
          stream={stream}
          mirrored={tile.isSelf && !tile.screen}
          fit={tile.screen ? "contain" : "cover"}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <ChatAvatar
            kind="direct"
            user={participant.user}
            title={participant.user.name}
            size={compact ? 56 : 72}
          />
        </div>
      )}
      <TileCaption
        name={
          tile.isSelf
            ? `${participant.user.name} (вы)`
            : participant.user.name
        }
        muted={muted}
        screen={tile.screen}
      />
    </li>
  );
}

/**
 * Чужой экран на сцене: целиком (`contain`), без зеркала, с кнопкой
 * «Во весь экран».
 *
 * Во весь экран — через Fullscreen API на самой плитке: так экран
 * разворачивается на весь монитор, а не на окно браузера, и выход — та же
 * клавиша Esc, что везде. Где API нет или он отказал (встроенный
 * просмотрщик, политика страницы), плитка разворачивается на всё окно
 * поверх панели, и из этого режима выводят та же кнопка и Esc.
 *
 * Показ кончился, пока плитка развёрнута, — плитка пропадает, а с ней и
 * полноэкранный режим: браузер сам выходит из него, когда развёрнутый
 * элемент убирают со страницы, а запасной режим живёт в её же состоянии.
 */
function StageTile({
  calls,
  tile,
  participant,
}: {
  calls: GroupCallsApi;
  tile: Tile;
  participant: ChatGroupCallParticipantDto | undefined;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [native, setNative] = useState(false);
  const [fallback, setFallback] = useState(false);
  const expanded = native || fallback;

  useEffect(() => {
    const read = () => setNative(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", read);
    return () => document.removeEventListener("fullscreenchange", read);
  }, []);

  useEffect(() => {
    if (!fallback) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFallback(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fallback]);

  const toggle = useCallback(() => {
    if (native) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (fallback) {
      setFallback(false);
      return;
    }
    const element = ref.current;
    if (element && document.fullscreenEnabled && element.requestFullscreen)
      void element.requestFullscreen().catch(() => setFallback(true));
    else setFallback(true);
  }, [fallback, native]);

  if (!participant) return null;
  const stream = tileStream(calls, tile);
  const name = participant.user.name;
  const muted = participant.muted;
  const speaking = calls.state.speaking.includes(tile.userId);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={spokenLabel({
        participant,
        isSelf: false,
        muted,
        speaking,
        statusLine: peerStateLabel(calls.state.peerStates[tile.userId]),
        cameraOff: tile.view === "avatar",
        screen: true,
      })}
      className={`flex min-h-48 flex-1 flex-col overflow-hidden bg-bg-1 ${
        fallback
          ? "fixed inset-0 z-[80]"
          : native
            ? ""
            : `relative rounded-2xl border ${
                speaking ? "border-cyan" : "border-glass-brd"
              }`
      }`}
    >
      <div className="relative min-h-0 flex-1">
        {tile.view === "video" && stream ? (
          <VideoTile
            stream={stream}
            mirrored={false}
            fit="contain"
            onDoubleClick={toggle}
          />
        ) : (
          // Поток ещё не доехал — аватар с подписью, а не чёрное поле.
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <ChatAvatar
              kind="direct"
              user={participant.user}
              title={name}
              size={72}
            />
            <p className="text-sm text-text-1">Готовим показ экрана…</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={
            expanded
              ? "Свернуть экран"
              : `Развернуть экран, который показывает ${name}, во весь экран`
          }
          className="absolute right-2 top-2 flex h-11 items-center gap-1.5 rounded-full border border-glass-brd bg-bg-1 px-3 text-sm font-semibold text-text-0 hover:bg-bg-2"
        >
          <ExpandIcon collapse={expanded} />
          <span className="hidden sm:inline">
            {expanded ? "Свернуть" : "Во весь экран"}
          </span>
        </button>
      </div>
      <TileCaption name={name} muted={muted} screen />
    </div>
  );
}

function TileCaption({
  name,
  muted,
  screen,
}: {
  name: string;
  muted: boolean;
  screen: boolean;
}) {
  return (
    <p className="relative flex w-full items-center gap-1.5 bg-glass px-3 py-1.5 text-xs font-semibold text-text-0">
      {screen && (
        <span aria-hidden className="shrink-0 text-text-1">
          <ScreenIcon active={false} size={16} />
        </span>
      )}
      <span className="truncate">{screen ? `Экран · ${name}` : name}</span>
      {muted && (
        <span aria-hidden className="shrink-0 text-text-1">
          <MicIcon off size={16} />
        </span>
      )}
    </p>
  );
}

/** Какой поток показывать в плитке: свой экран, свою камеру или чужой. */
function tileStream(calls: GroupCallsApi, tile: Tile): MediaStream | null {
  if (!tile.isSelf) return calls.remoteStreams[tile.userId] ?? null;
  return tile.screen ? calls.localScreenStream : calls.localVideoStream;
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
 *
 * `fit`: лицо — `cover` (плитка заполнена, края обрезаны), экран —
 * `contain` (виден целиком: обрезанный край слайда — потерянный текст).
 */
function VideoTile({
  stream,
  mirrored,
  fit = "cover",
  onDoubleClick,
}: {
  stream: MediaStream;
  mirrored: boolean;
  fit?: "cover" | "contain";
  onDoubleClick?: () => void;
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
      onDoubleClick={onDoubleClick}
      // Свою камеру показываем зеркально: человек привык видеть себя
      // таким, каким его показывает зеркало. Экран — никогда: зеркальный
      // текст не прочитать.
      className={`absolute inset-0 size-full ${fit === "contain" ? "object-contain" : "object-cover"} ${mirrored ? "-scale-x-100" : ""}`}
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
  screen = false,
}: {
  participant: ChatGroupCallParticipantDto;
  isSelf: boolean;
  muted: boolean;
  speaking: boolean;
  statusLine: string | null;
  cameraOff: boolean;
  screen?: boolean;
}): string {
  return [
    isSelf ? `${participant.user.name} (вы)` : participant.user.name,
    participant.host ? "хозяин звонка" : null,
    screen ? "показывает экран" : cameraOff ? "камера выключена" : null,
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

/**
 * Широкий ли экран — по нему раскладка режет сетку вдоль или поперёк
 * (`video-grid.ts`).
 *
 * Не украшение и не «на всякий случай»: портал открывают и с телефона в
 * браузере. При жёстком «панель на сайте всегда широкая» трое вставали там
 * тремя вертикальными полосами по 120 точек, где от лица остаётся щель, —
 * ровно тот случай, против которого написано правило в `video-grid.ts`.
 *
 * Порог 640 точек — граница `sm` в Tailwind, та же, по которой ломается
 * остальная вёрстка портала. `matchMedia`, а не слушатель `resize`: он
 * срабатывает один раз на переходе через порог, а не на каждый пиксель
 * перетаскивания окна.
 */
function useWideViewport(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const read = () => setWide(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);
  return wide;
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

function ScreenIcon({ active, size = 24 }: { active: boolean; size?: number }) {
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
      <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
      <path d="M8 21h8M12 17v4" />
      {active ? (
        <path d="M9.5 8.5l5 5M14.5 8.5l-5 5" />
      ) : (
        <path d="M12 14V8m-2.5 2.5L12 8l2.5 2.5" />
      )}
    </svg>
  );
}

function ExpandIcon({ collapse = false }: { collapse?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {collapse ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </svg>
  );
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
