"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { Pin } from "lucide-react";
import { LONG_PRESS_MS, type ChatQuickSlotId } from "./chat-quick-slot";

/**
 * Панель вложений. Плитки идут в том же порядке, что на макете: сперва то,
 * что шлют чаще (фото и файл), потом карточки сервисов портала.
 *
 * Карточки чужих сервисов выбираются у себя дома: плитка ведёт в Вдохновение,
 * Объявления или Рынок, а оттуда кнопка «Отправить в чат» приводит обратно
 * со снимком карточки. Так чат не читает чужие таблицы, а сервисы не знают
 * про его устройство.
 *
 * Любую плитку можно закрепить в быстрый слот у поля ввода: булавкой в
 * углу, долгим нажатием (телефон) или перетаскиванием мышью на слот.
 * Булавка — основной путь: она видна, доступна с клавиатуры и не спорит с
 * прокруткой; жесты — ускорители для тех, кто их ждёт.
 */

export type AttachTileTone = "cyan" | "gold" | "violet" | "plain";

export interface AttachTileMeta {
  id: ChatQuickSlotId;
  label: string;
  tone: AttachTileTone;
  /** Плитка-переход в сервис, где карточку выбирают. */
  href?: string;
}

export const ATTACH_TILES: readonly AttachTileMeta[] = [
  { id: "photo", label: "Фото", tone: "cyan" },
  { id: "file", label: "Файл", tone: "violet" },
  { id: "emoji", label: "Смайлы", tone: "cyan" },
  { id: "story", label: "Сторис", tone: "gold", href: "/motivation" },
  { id: "notice", label: "Объявление", tone: "gold", href: "/notices" },
  { id: "product", label: "Товар", tone: "cyan", href: "/market" },
  { id: "contact", label: "Контакт", tone: "violet", href: "/chat/people" },
  { id: "assistant", label: "Ассистент", tone: "cyan" },
];

export function attachTileMeta(id: ChatQuickSlotId): AttachTileMeta {
  return ATTACH_TILES.find((tile) => tile.id === id)!;
}

/** Тип данных при перетаскивании плитки на быстрый слот. */
export const ATTACH_DRAG_TYPE = "application/x-vedamatch-attach-tile";

export function AttachTileIcon({ id }: { id: ChatQuickSlotId }) {
  switch (id) {
    case "photo":
      return <PhotoIcon />;
    case "file":
      return <FileIcon />;
    case "emoji":
      return <SmileIcon />;
    case "story":
      return <StarIcon />;
    case "notice":
      return <NoticeIcon />;
    case "product":
      return <CartIcon />;
    case "contact":
      return <PersonIcon />;
    case "assistant":
      return <BotIcon />;
  }
}

export function ChatAttachSheet({
  onPickImage,
  onPickFile,
  onOpenEmoji,
  onOpenAssistant,
  pinned,
  onPin,
  onClose,
}: {
  onPickImage: () => void;
  onPickFile: () => void;
  onOpenEmoji: () => void;
  /** Помощник переписки; пусто — выключен администратором. */
  onOpenAssistant?: () => void;
  /** Что сейчас в быстром слоте у поля ввода. */
  pinned: ChatQuickSlotId;
  onPin: (id: ChatQuickSlotId) => void;
  onClose: () => void;
}) {
  const actions: Partial<Record<ChatQuickSlotId, () => void>> = {
    photo: onPickImage,
    file: onPickFile,
    emoji: onOpenEmoji,
    assistant: onOpenAssistant,
  };
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-glass-brd bg-glass p-3">
      <div className="grid grid-cols-4 gap-3">
        {ATTACH_TILES.filter((tile) => tile.href || actions[tile.id]).map(
          (tile) => (
            <Tile
              key={tile.id}
              meta={tile}
              pinned={pinned === tile.id}
              onClick={actions[tile.id]}
              onPin={() => onPin(tile.id)}
            />
          ),
        )}
        <Tile
          meta={{ id: "photo", label: "Закрыть", tone: "plain" }}
          icon={<CloseIcon />}
          onClick={onClose}
        />
      </div>
      <p className="px-1 text-[11px] leading-4 text-text-2">
        Булавка на плитке закрепляет её рядом с полем ввода. То же — долгим
        нажатием или перетаскиванием на слот.
      </p>
    </div>
  );
}

const TONES: Record<AttachTileTone, string> = {
  cyan: "border-cyan/34 bg-cyan/12 text-cyan",
  gold: "border-gold/34 bg-gold/12 text-gold",
  violet: "border-[#B23EFF]/34 bg-[#B23EFF]/12 text-[#C68BFF]",
  plain: "border-glass-brd bg-white/5 text-text-1",
};

export function tileToneClass(tone: AttachTileTone): string {
  return TONES[tone];
}

function Tile({
  meta,
  icon,
  pinned,
  onClick,
  onPin,
}: {
  meta: AttachTileMeta;
  /** Своя иконка вместо иконки по id — у плитки «Закрыть». */
  icon?: ReactNode;
  pinned?: boolean;
  onClick?: () => void;
  /** Нет — плитку закрепить нельзя (это «Закрыть»). */
  onPin?: () => void;
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  function startPress() {
    if (!onPin) return;
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      onPin();
    }, LONG_PRESS_MS);
  }
  function endPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }
  /* После долгого нажатия обычный клик той же плитки не должен сработать:
     человек закреплял, а не открывал. */
  function guardClick(event: React.MouseEvent) {
    if (longPressed.current) {
      event.preventDefault();
      longPressed.current = false;
    }
  }

  const inside = (
    <>
      <span
        className={`relative flex size-14 items-center justify-center rounded-[18px] border ${TONES[meta.tone]}`}
      >
        {icon ?? <AttachTileIcon id={meta.id} />}
        {pinned && (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-mint-edge bg-mint text-on-mint"
          >
            <Pin className="size-3" />
          </span>
        )}
      </span>
      <span className="text-center text-xs font-medium leading-4 text-text-1">
        {meta.label}
      </span>
    </>
  );

  const gestureProps = onPin
    ? {
        draggable: true,
        onDragStart: (event: React.DragEvent) => {
          event.dataTransfer.setData(ATTACH_DRAG_TYPE, meta.id);
          event.dataTransfer.effectAllowed = "copy";
        },
        onPointerDown: startPress,
        onPointerUp: endPress,
        onPointerLeave: endPress,
        onPointerCancel: endPress,
        onContextMenu: (event: React.MouseEvent) => {
          // Долгое нажатие на телефоне открывает контекстное меню браузера —
          // оно тут ни к чему, закрепление уже сработало.
          if (longPressed.current) event.preventDefault();
        },
        onClick: guardClick,
      }
    : {};

  return (
    <div className="relative flex flex-col items-center gap-2">
      {meta.href ? (
        // Карточку выбирают в её сервисе: плитка — обычная ссылка туда.
        <Link
          href={meta.href}
          className="flex flex-col items-center gap-2 transition-transform hover:-translate-y-0.5"
          {...gestureProps}
        >
          {inside}
        </Link>
      ) : (
        <button
          type="button"
          className="flex flex-col items-center gap-2 transition-transform hover:-translate-y-0.5"
          {...gestureProps}
          onClick={(event) => {
            guardClick(event);
            if (!event.defaultPrevented) onClick?.();
          }}
        >
          {inside}
        </button>
      )}
      {onPin && !pinned && (
        <button
          type="button"
          onClick={onPin}
          aria-label={`Закрепить «${meta.label}» рядом с полем ввода`}
          title="Закрепить рядом с полем ввода"
          className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full border border-glass-brd bg-bg-1 text-text-2 opacity-70 hover:text-text-0 hover:opacity-100 focus-visible:opacity-100"
        >
          <Pin className="size-3" />
        </button>
      )}
    </div>
  );
}

function PhotoIcon() {
  return (
    <Svg>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="10" r="2" />
      <path d="M4 17l5-4 4 3 3-2 4 3" />
    </Svg>
  );
}

function FileIcon() {
  return (
    <Svg>
      <path d="M14 3v5h5" />
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
    </Svg>
  );
}

function SmileIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 14.5a4 4 0 006 0" />
      <path d="M9.2 9.5h.01" />
      <path d="M14.8 9.5h.01" />
    </Svg>
  );
}

function StarIcon() {
  return (
    <Svg>
      <path d="M12 3.5l2.4 5 5.6.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.6-.8z" />
    </Svg>
  );
}

function NoticeIcon() {
  return (
    <Svg>
      <path d="M5 4h9l5 5v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </Svg>
  );
}

function CartIcon() {
  return (
    <Svg>
      <path d="M4 8h16l-1.4 10.2a2 2 0 01-2 1.8H7.4a2 2 0 01-2-1.8z" />
      <path d="M9 8V6.5a3 3 0 016 0V8" />
    </Svg>
  );
}

function PersonIcon() {
  return (
    <Svg>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0114 0" />
    </Svg>
  );
}

function BotIcon() {
  return (
    <Svg>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 8V4" />
      <path d="M9 13h.01" />
      <path d="M15 13h.01" />
      <path d="M9.5 16.5h5" />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Svg>
  );
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}
