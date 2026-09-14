"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CHAT_DEFAULT_FAVORITE_EMOJIS } from "@vedamatch/shared";
import {
  EMOJI_TABS,
  RECENT_EMOJI_KEY,
  groupEmojiRows,
  parseRecentEmojis,
  searchEmojis,
  withRecentEmoji,
  type EmojiRow,
} from "./emoji-picker";
import {
  FAVORITE_EMOJI_KEY,
  loadDefaultFavoriteEmojis,
  parseFavoriteEmojis,
  toggleFavoriteEmoji,
} from "./favorite-emojis";

function readRecent(): string[] {
  try {
    return parseRecentEmojis(window.localStorage.getItem(RECENT_EMOJI_KEY));
  } catch {
    // Хранилище закрыто (приватный режим) — начинаем с быстрого ряда.
    return parseRecentEmojis(null);
  }
}

function readFavorites(): string[] | null {
  try {
    return parseFavoriteEmojis(window.localStorage.getItem(FAVORITE_EMOJI_KEY));
  } catch {
    return null;
  }
}

/**
 * Панель смайликов (VED-122): поиск, «Недавние» и вкладки категорий, как во
 * всех мессенджерах. Раньше в переписке был один ряд из восьми смайликов.
 *
 * Первой идёт категория «Избранные» (VED-123): набор администрации, который
 * каждый переделывает под себя — «Настроить», и нажатие на любой смайлик
 * добавляет его в избранное или убирает оттуда.
 *
 * Набор — почти две тысячи смайликов с русскими названиями — подгружается
 * при открытии панели, а не вместе с перепиской: открывают её не каждый раз.
 */
export function ChatEmojiPicker({
  onPick,
  label = "Смайлики",
}: {
  onPick: (emoji: string) => void;
  label?: string;
}) {
  const [rows, setRows] = useState<readonly EmojiRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(readRecent);
  // `null` — свой набор не собран, показываем набор администрации.
  const [ownFavorites, setOwnFavorites] = useState<string[] | null>(readFavorites);
  const [defaultFavorites, setDefaultFavorites] = useState<string[]>([
    ...CHAT_DEFAULT_FAVORITE_EMOJIS,
  ]);
  const [editing, setEditing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    let alive = true;
    import("./emoji-data")
      .then((module) => {
        if (alive) setRows(module.EMOJI_ROWS);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    void loadDefaultFavoriteEmojis().then((emojis) => {
      if (alive) setDefaultFavorites(emojis);
    });
    return () => {
      alive = false;
    };
  }, []);

  const favorites = ownFavorites ?? defaultFavorites;
  const groups = useMemo(() => (rows ? groupEmojiRows(rows) : []), [rows]);
  // Подпись для скринридера и у недавних: их список хранит только сами знаки.
  const labels = useMemo(
    () => new Map((rows ?? []).map(([emoji, , name]) => [emoji, name])),
    [rows],
  );
  const found = useMemo(
    () => (rows && query.trim() ? searchEmojis(rows, query) : null),
    [rows, query],
  );

  function saveFavorites(next: string[] | null) {
    setOwnFavorites(next);
    try {
      if (next === null) window.localStorage.removeItem(FAVORITE_EMOJI_KEY);
      else window.localStorage.setItem(FAVORITE_EMOJI_KEY, JSON.stringify(next));
    } catch {
      // Не запомнили — набор проживёт до закрытия панели.
    }
  }

  function pick(emoji: string) {
    // В настройке нажатие правит избранное, а не пишет смайлик в сообщение.
    if (editing) {
      saveFavorites(toggleFavoriteEmoji(favorites, emoji));
      return;
    }
    onPick(emoji);
    const next = withRecentEmoji(recent, emoji);
    setRecent(next);
    try {
      window.localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(next));
    } catch {
      // Не запомнили — не беда: смайлик уже вставлен.
    }
  }

  function jumpTo(index: number) {
    const section = sectionRefs.current[index];
    const box = scrollRef.current;
    if (section && box) box.scrollTop = section.offsetTop;
  }

  const button = (emoji: string, name?: string) => {
    const title = name ?? labels.get(emoji) ?? emoji;
    const chosen = editing && favorites.includes(emoji);
    return (
      <button
        key={emoji}
        type="button"
        onClick={() => pick(emoji)}
        aria-label={title}
        // В настройке кнопка — переключатель «в избранном или нет».
        aria-pressed={editing ? chosen : undefined}
        title={name ?? labels.get(emoji)}
        className={`flex size-9 items-center justify-center rounded-lg text-2xl leading-none hover:bg-white/10 ${
          chosen ? "bg-gold/20 ring-1 ring-gold/60" : ""
        }`}
      >
        {emoji}
      </button>
    );
  };

  return (
    <div
      role="group"
      aria-label={label}
      className="rounded-2xl border border-glass-brd bg-glass p-2"
    >
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Найти смайлик"
        aria-label="Найти смайлик"
        className="mb-2 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
      />

      {!found && (
        // Категории — не вкладки в строгом смысле: секции идут подряд, как
        // в мессенджерах, и кнопка прокручивает к своей.
        <nav
          aria-label="Категории смайликов"
          className="mb-1 flex gap-0.5 overflow-x-auto border-b border-glass-brd pb-1"
        >
          <button
            type="button"
            onClick={() => jumpTo(0)}
            aria-label="Избранные"
            title="Избранные"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-lg hover:bg-white/10"
          >
            ⭐
          </button>
          {EMOJI_TABS.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => jumpTo(index + 2)}
              aria-label={tab.label}
              title={tab.label}
              disabled={!rows}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-lg hover:bg-white/10 disabled:opacity-40"
            >
              {tab.icon}
            </button>
          ))}
        </nav>
      )}

      <div ref={scrollRef} className="relative max-h-64 overflow-y-auto">
        {found ? (
          found.length > 0 ? (
            <div className="grid grid-cols-8 gap-0.5">
              {found.map(([emoji, , name]) => button(emoji, name))}
            </div>
          ) : (
            <p className="px-1 py-6 text-center text-sm text-text-2">
              Ничего не нашлось
            </p>
          )
        ) : (
          <>
            <section
              ref={(node) => {
                sectionRefs.current[0] = node;
              }}
              aria-label="Избранные"
            >
              <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 bg-bg-1/90 px-1 py-1">
                <p className="text-xs text-text-2">Избранные</p>
                <button
                  type="button"
                  onClick={() => setEditing((was) => !was)}
                  aria-pressed={editing}
                  className="text-xs font-medium text-text-1 underline-offset-2 hover:text-text-0 hover:underline"
                >
                  {editing ? "Готово" : "Настроить"}
                </button>
              </div>
              {editing && (
                <p className="px-1 pb-1 text-xs text-text-2">
                  Нажмите на смайлик ниже, чтобы добавить его в избранные или
                  убрать.{" "}
                  {ownFavorites !== null && (
                    <button
                      type="button"
                      onClick={() => saveFavorites(null)}
                      className="font-medium text-text-1 underline underline-offset-2 hover:text-text-0"
                    >
                      Вернуть набор по умолчанию
                    </button>
                  )}
                </p>
              )}
              {favorites.length > 0 ? (
                <div className="grid grid-cols-8 gap-0.5">
                  {favorites.map((emoji) => button(emoji))}
                </div>
              ) : (
                <p className="px-1 py-2 text-xs text-text-2">
                  Пусто — нажмите «Настроить» и выберите смайлики.
                </p>
              )}
            </section>
            <section
              ref={(node) => {
                sectionRefs.current[1] = node;
              }}
              aria-label="Недавние"
            >
              <p className="sticky top-0 z-[1] bg-bg-1/90 px-1 py-1 text-xs text-text-2">
                Недавние
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {recent.map((emoji) => button(emoji))}
              </div>
            </section>
            {failed && (
              <p role="alert" className="px-1 py-4 text-center text-sm text-text-2">
                Остальные смайлики не загрузились — проверьте связь
              </p>
            )}
            {groups.map((group, index) =>
              group.length === 0 ? null : (
                <section
                  key={EMOJI_TABS[index].id}
                  ref={(node) => {
                    sectionRefs.current[index + 2] = node;
                  }}
                  aria-label={EMOJI_TABS[index].label}
                  // Почти две тысячи кнопок: невидимые секции браузер не
                  // раскладывает, пока до них не долистали.
                  className="[contain-intrinsic-size:auto_320px] [content-visibility:auto]"
                >
                  <p className="sticky top-0 z-[1] bg-bg-1/90 px-1 py-1 text-xs text-text-2">
                    {EMOJI_TABS[index].label}
                  </p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {group.map(([emoji, , name]) => button(emoji, name))}
                  </div>
                </section>
              ),
            )}
          </>
        )}
      </div>
    </div>
  );
}
