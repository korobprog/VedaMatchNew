"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import Link from "next/link";
import type { MusicListenDto } from "@vedamatch/shared";
import { MUSIC_BOOKMARK_LABEL_MAX, MUSIC_SEEK_STEPS } from "@vedamatch/shared";
import { Pencil, X } from "lucide-react";
import { formatTrackDuration } from "@/lib/music-duration";
import { formatListenedAt } from "@/lib/music-listened-at";
import { getListenHistory } from "@/lib/music-playback-api";
import { useMusicPlayer } from "./player-provider";
import { seekButtonLabel, seekStepWords, type PlayerPrefs } from "./player-prefs";
import {
  bookmarkJumpLabel,
  bookmarkSavedText,
  bookmarkTitle,
  historyQueue,
  historyResumeAt,
  historyRows,
} from "./player-marks";
import { SEEK_HOTKEYS_HINT } from "./seek-hotkeys";
import type { TrackBookmarks } from "./use-track-bookmarks";
import { SeekStepGlyph } from "./seek-step-glyph";

/**
 * Настройки плеера (VED-388): шаги перемотки, метки-закладки, история.
 *
 * Каждая из трёх кнопок — перемотка, «Метка», «История» — живёт здесь и
 * работает прямо из панели, а выключателем её можно вынести на полосу
 * плеера. Так просил заказчик: «Все эти кнопки чтобы можно было вынести на
 * интерфейс плеера в развернутом виде».
 *
 * Вкладки, а не одна длинная простыня: на телефоне панель — это 60% экрана,
 * и метки с историей под настройками уезжали бы за три прокрутки.
 */

export type PlayerPanelTab = "settings" | "bookmarks" | "history";

const TABS: { id: PlayerPanelTab; label: string }[] = [
  { id: "settings", label: "Настройки" },
  { id: "bookmarks", label: "Метки" },
  { id: "history", label: "История" },
];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MusicPlayerSettingsPanel({
  tab,
  onTab,
  onClose,
  onAnnounce,
  bookmarks,
}: {
  tab: PlayerPanelTab;
  onTab: (tab: PlayerPanelTab) => void;
  onClose: () => void;
  onAnnounce: (text: string) => void;
  bookmarks: TrackBookmarks;
}) {
  const player = useMusicPlayer();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<PlayerPanelTab, HTMLButtonElement | null>>({
    settings: null,
    bookmarks: null,
    history: null,
  });
  const titleId = useId();
  const panelId = useId();

  // Фокус — на выбранную вкладку: иначе Tab уводит по странице под панелью.
  useEffect(() => {
    tabRefs.current[tab]?.focus();
    // Только при открытии: смена вкладки стрелками сама переводит фокус.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Tab ходит по кругу внутри панели: она объявлена модальной, и фокус,
  // ушедший на страницу под ней, скринридер прочитал бы без контекста.
  const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const nodes = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    ).filter((node) => node.offsetParent !== null || node === document.activeElement);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onTabKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const at = TABS.findIndex((row) => row.id === tab);
    let next = -1;
    if (event.key === "ArrowRight") next = (at + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (at - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const id = TABS[next].id;
    onTab(id);
    tabRefs.current[id]?.focus();
  };

  if (!player?.current) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={trapTab}
      // Якорь — вся полоса (`relative` у секции), как у панели текста: от
      // узкой кнопки в середине ряда панель уезжала бы за левый край.
      //
      // Фон сплошной, а не стекло `.player-bar`: панель лежит внутри
      // полосы, у которой уже есть `backdrop-filter`, а вложенное размытие
      // браузер не рисует — сквозь панель читался заголовок страницы.
      // Высота — от места над полосой (`--vm-player-space` из globals.css)
      // за вычетом шапки портала: на телефоне 70% экрана уходили под шапку.
      className="pointer-events-auto absolute bottom-full right-0 z-10 mb-2 flex max-h-[min(34rem,calc(100dvh-var(--vm-player-space,0px)-5.5rem))] w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-glass-brd bg-bg-0 shadow-[0_-2px_24px_var(--vm-player-shadow)]"
    >
      <div className="flex items-center gap-2 px-3 pt-3">
        <h2 id={titleId} className="font-display text-sm font-bold text-text-0">
          Плеер
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть настройки плеера"
          className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0 sm:size-9"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <div role="tablist" aria-label="Разделы плеера" className="flex gap-1 px-3 pb-2">
        {TABS.map((row) => {
          const selected = row.id === tab;
          return (
            <button
              key={row.id}
              ref={(node) => {
                tabRefs.current[row.id] = node;
              }}
              type="button"
              role="tab"
              id={`${panelId}-${row.id}`}
              aria-selected={selected}
              aria-controls={`${panelId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTab(row.id)}
              onKeyDown={onTabKey}
              className={`min-h-11 flex-1 rounded-xl px-2 text-[13px] font-semibold transition-colors sm:min-h-9 ${
                selected
                  ? "bg-violet/15 text-text-0 ring-1 ring-inset ring-violet/40"
                  : "text-text-1 hover:bg-glass hover:text-text-0"
              }`}
            >
              {row.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${panelId}-panel`}
        role="tabpanel"
        aria-labelledby={`${panelId}-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
      >
        {tab === "settings" && (
          <SettingsTab
            onAnnounce={onAnnounce}
            onOpenTab={(next) => {
              onTab(next);
              // Фокус следует за вкладкой: иначе он остаётся на исчезнувшей
              // кнопке и проваливается в начало страницы.
              requestAnimationFrame(() => tabRefs.current[next]?.focus());
            }}
            bookmarks={bookmarks}
          />
        )}
        {tab === "bookmarks" && (
          <BookmarksTab bookmarks={bookmarks} onAnnounce={onAnnounce} />
        )}
        {tab === "history" && <HistoryTab onAnnounce={onAnnounce} onClose={onClose} />}
      </div>
    </div>
  );
}

// ---------- Настройки ----------

function SettingsTab({
  onAnnounce,
  onOpenTab,
  bookmarks,
}: {
  onAnnounce: (text: string) => void;
  onOpenTab: (tab: PlayerPanelTab) => void;
  bookmarks: TrackBookmarks;
}) {
  const player = useMusicPlayer();
  const [error, setError] = useState<string | null>(null);
  if (!player) return null;
  const { prefs } = player;

  const save = (patch: Partial<PlayerPrefs>) => {
    setError(null);
    void player.setPrefs(patch).then((ok) => {
      if (!ok) setError("Не удалось сохранить настройку. Попробуйте ещё раз.");
    });
  };

  const seekBy = (direction: -1 | 1) => {
    const step = direction < 0 ? prefs.seekBackSeconds : prefs.seekForwardSeconds;
    player.skip(direction * step);
  };

  return (
    <div className="flex flex-col gap-4 pt-1">
      <section aria-labelledby="player-seek-title" className="flex flex-col gap-2.5">
        <h3 id="player-seek-title" className="text-[13px] font-semibold text-text-0">
          Перемотка
        </h3>
        <StepPicker
          legend="Назад"
          value={prefs.seekBackSeconds}
          onChange={(value) => save({ seekBackSeconds: value })}
        />
        <StepPicker
          legend="Вперёд"
          value={prefs.seekForwardSeconds}
          onChange={(value) => save({ seekForwardSeconds: value })}
        />
        <div className="flex gap-2">
          <PanelAction
            label={seekButtonLabel(-1, prefs.seekBackSeconds)}
            onClick={() => seekBy(-1)}
          >
            <SeekStepGlyph direction={-1} seconds={prefs.seekBackSeconds} />
            <span aria-hidden="true">Назад</span>
          </PanelAction>
          <PanelAction
            label={seekButtonLabel(1, prefs.seekForwardSeconds)}
            onClick={() => seekBy(1)}
          >
            <span aria-hidden="true">Вперёд</span>
            <SeekStepGlyph direction={1} seconds={prefs.seekForwardSeconds} />
          </PanelAction>
        </div>
        <PinSwitch
          label="Кнопки перемотки на плеере"
          hint="На широком экране они есть всегда"
          checked={prefs.showSeek}
          onChange={(value) => save({ showSeek: value })}
        />
        <p className="text-[11px] text-text-2">
          {SEEK_HOTKEYS_HINT} — с этим же шагом, как и кнопки в наушниках
        </p>
      </section>

      <section aria-labelledby="player-mark-title" className="flex flex-col gap-2.5">
        <h3 id="player-mark-title" className="text-[13px] font-semibold text-text-0">
          Метки
        </h3>
        <div className="flex gap-2">
          <PanelAction
            label={`Поставить метку на ${formatTrackDuration(player.positionSeconds)}`}
            onClick={() => {
              void bookmarks.add(player.positionSeconds).then((created) => {
                onAnnounce(created ? bookmarkSavedText(created) : "Не удалось поставить метку");
              });
            }}
          >
            <span aria-hidden="true">Метка на {formatTrackDuration(player.positionSeconds)}</span>
          </PanelAction>
          <PanelAction label="Все метки записи" onClick={() => onOpenTab("bookmarks")}>
            <span aria-hidden="true">Все метки</span>
          </PanelAction>
        </div>
        <PinSwitch
          label="Кнопка «Метка» на плеере"
          checked={prefs.showBookmark}
          onChange={(value) => save({ showBookmark: value })}
        />
      </section>

      <section aria-labelledby="player-history-title" className="flex flex-col gap-2.5">
        <h3 id="player-history-title" className="text-[13px] font-semibold text-text-0">
          История
        </h3>
        <PanelAction label="Открыть историю прослушанного" onClick={() => onOpenTab("history")}>
          <span aria-hidden="true">Что слушали недавно</span>
        </PanelAction>
        <PinSwitch
          label="Кнопка «История» на плеере"
          checked={prefs.showHistory}
          onChange={(value) => save({ showHistory: value })}
        />
      </section>

      {error && (
        <p role="alert" className="text-[12px] text-text-0">
          {error}
        </p>
      )}
    </div>
  );
}

/** Выбор шага: настоящие радиокнопки — стрелки и объявление «3 из 5» бесплатно. */
function StepPicker({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[12px] text-text-1">{legend}</legend>
      <div className="flex gap-1.5">
        {MUSIC_SEEK_STEPS.map((step) => (
          <label key={step} className="relative flex-1">
            <input
              type="radio"
              name={name}
              value={step}
              checked={value === step}
              onChange={() => onChange(step)}
              className="peer absolute inset-0 size-full cursor-pointer opacity-0"
            />
            <span className="pointer-events-none flex min-h-11 items-center justify-center rounded-xl border border-glass-brd font-mono text-[13px] text-text-1 peer-checked:border-violet peer-checked:bg-violet/15 peer-checked:font-semibold peer-checked:text-text-0 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-magenta sm:min-h-9">
              <span aria-hidden="true">{step === 60 ? "1 мин" : `${step} с`}</span>
              <span className="sr-only">{seekStepWords(step)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** «Показывать на плеере» — переключатель, а не флажок: действует сразу. */
function PinSwitch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const hintId = useId();
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] text-text-0">{label}</span>
        {hint && (
          <span id={hintId} className="text-[11px] text-text-2">
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.checked)}
        // Системный переключатель, а не нарисованный: его цвет, фокус и
        // состояние браузер держит сам в обеих темах.
        className="size-5 shrink-0 cursor-pointer accent-violet"
      />
    </label>
  );
}

function PanelAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-glass-brd px-3 text-[13px] font-semibold text-text-1 hover:bg-glass hover:text-text-0 sm:min-h-9"
    >
      {children}
    </button>
  );
}

// ---------- Метки ----------

function BookmarksTab({
  bookmarks,
  onAnnounce,
}: {
  bookmarks: TrackBookmarks;
  onAnnounce: (text: string) => void;
}) {
  const player = useMusicPlayer();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const { load } = bookmarks;

  useEffect(() => {
    load();
  }, [load]);

  if (!player?.current) return null;
  const position = player.positionSeconds;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const created = await bookmarks.add(position, label.trim() || null);
    setBusy(false);
    if (created) setLabel("");
    onAnnounce(created ? bookmarkSavedText(created) : "Не удалось поставить метку");
  };

  const saveRename = async (id: string) => {
    const updated = await bookmarks.rename(id, draft.trim() || null);
    onAnnounce(updated ? "Подпись сохранена" : "Не удалось сохранить подпись");
    if (updated) setEditing(null);
  };

  const items = bookmarks.items;

  return (
    <div className="flex flex-col gap-3 pt-1">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-[12px] text-text-1">
          Подпись к метке — необязательно
        </label>
        <input
          id={inputId}
          value={label}
          maxLength={MUSIC_BOOKMARK_LABEL_MAX}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Например: стих 2.13"
          className="min-h-11 rounded-xl border border-glass-brd bg-transparent px-3 text-[13px] text-text-0 placeholder:text-text-2 sm:min-h-9"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-xl border border-mint-edge bg-mint px-3 text-[13px] font-semibold text-on-mint disabled:opacity-60 sm:min-h-9"
        >
          Поставить метку на {formatTrackDuration(position)}
        </button>
      </form>

      {items === null && !bookmarks.failed && (
        <p className="text-[13px] text-text-2" role="status">
          Загружаем метки…
        </p>
      )}
      {bookmarks.failed && (
        <p className="text-[13px] text-text-1" role="status">
          Не удалось загрузить метки.
        </p>
      )}
      {items !== null && items.length === 0 && (
        <p className="text-[13px] text-text-2">В этой записи меток пока нет.</p>
      )}
      {items !== null && items.length > 0 && (
        <ul aria-label={`Метки записи: ${items.length}`} className="flex flex-col">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-1">
              {editing === item.id ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveRename(item.id);
                  }}
                >
                  <input
                    autoFocus
                    aria-label={`Подпись метки на ${formatTrackDuration(item.positionSeconds)}`}
                    value={draft}
                    maxLength={MUSIC_BOOKMARK_LABEL_MAX}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        event.nativeEvent.stopImmediatePropagation();
                        setEditing(null);
                      }
                    }}
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-glass-brd bg-transparent px-3 text-[13px] text-text-0 sm:min-h-9"
                  />
                  <button
                    type="submit"
                    className="min-h-11 shrink-0 rounded-xl px-3 text-[13px] font-semibold text-text-0 hover:bg-glass sm:min-h-9"
                  >
                    Сохранить
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label={bookmarkJumpLabel(item)}
                    onClick={() => {
                      player.seek(item.positionSeconds);
                      onAnnounce(`Позиция ${formatTrackDuration(item.positionSeconds)}`);
                    }}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 text-left hover:bg-glass sm:min-h-9"
                  >
                    <span className="w-12 shrink-0 font-mono text-[12px] text-text-1">
                      {formatTrackDuration(item.positionSeconds)}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-[13px] ${
                        item.label ? "text-text-0" : "text-text-2"
                      }`}
                    >
                      {item.label ?? "без подписи"}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Изменить подпись: ${bookmarkTitle(item)}`}
                    onClick={() => {
                      setDraft(item.label ?? "");
                      setEditing(item.id);
                    }}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0 sm:size-9"
                  >
                    <Pencil aria-hidden className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Удалить: ${bookmarkTitle(item)}`}
                    onClick={() => {
                      void bookmarks.remove(item.id).then((ok) =>
                        onAnnounce(ok ? "Метка удалена" : "Не удалось удалить метку"),
                      );
                    }}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-magenta sm:size-9"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- История ----------

function HistoryTab({
  onAnnounce,
  onClose,
}: {
  onAnnounce: (text: string) => void;
  onClose: () => void;
}) {
  const player = useMusicPlayer();
  const [items, setItems] = useState<MusicListenDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getListenHistory().then((result) => {
      if (cancelled) return;
      if (result) setItems(result.items);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!player) return null;

  if (failed) {
    return (
      <p className="pt-1 text-[13px] text-text-1" role="status">
        Не удалось загрузить историю.
      </p>
    );
  }
  if (items === null) {
    return (
      <p className="pt-1 text-[13px] text-text-2" role="status">
        Загружаем историю…
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="pt-1 text-[13px] text-text-2">
        Пока пусто. Запись попадает сюда, когда её послушали хотя бы полминуты.
      </p>
    );
  }

  const rows = historyRows(items);
  const queue = historyQueue(items);

  return (
    <div className="flex flex-col gap-2 pt-1">
      <ol aria-label="Недавно слушали" className="flex flex-col">
        {rows.map((item) => {
          const resumeAt = historyResumeAt(item);
          const isCurrent = player.current?.id === item.track.id;
          const when = formatListenedAt(item.listenedAt);
          return (
            <li key={item.track.id}>
              <button
                type="button"
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`${item.track.title}. Слушали: ${when}${
                  resumeAt ? `. Продолжить с ${formatTrackDuration(resumeAt)}` : ""
                }`}
                onClick={() => {
                  player.play(item.track.id, queue, resumeAt);
                  onAnnounce(`Играет: ${item.track.title}`);
                }}
                className={`flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-glass ${
                  isCurrent ? "bg-violet/10 ring-1 ring-inset ring-violet/40" : ""
                }`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-semibold text-text-0">
                    {item.track.title}
                  </span>
                  <span className="truncate text-[11px] text-text-2">
                    {item.track.artist?.name ?? "Исполнитель не указан"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end font-mono text-[11px] text-text-2">
                  <time dateTime={item.listenedAt}>{when}</time>
                  {resumeAt ? <span>с {formatTrackDuration(resumeAt)}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <Link
        href="/music/history"
        onClick={onClose}
        className="flex min-h-11 items-center justify-center rounded-xl text-[13px] font-semibold text-text-1 hover:bg-glass hover:text-text-0 sm:min-h-9"
      >
        Вся история
      </Link>
    </div>
  );
}
