"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Панель вложений. Плитки идут в том же порядке, что на макете: сперва то,
 * что шлют чаще (фото и файл), потом карточки сервисов портала.
 *
 * Карточки чужих сервисов выбираются у себя дома: плитка ведёт в Вдохновение,
 * Объявления или Рынок, а оттуда кнопка «Отправить в чат» приводит обратно
 * со снимком карточки. Так чат не читает чужие таблицы, а сервисы не знают
 * про его устройство.
 */
export function ChatAttachSheet({
  onPickImage,
  onPickFile,
  onOpenEmoji,
  onOpenAssistant,
  onClose,
}: {
  onPickImage: () => void;
  onPickFile: () => void;
  onOpenEmoji: () => void;
  /** Помощник переписки; пусто — выключен администратором. */
  onOpenAssistant?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-glass-brd bg-glass p-3">
      <div className="grid grid-cols-4 gap-3">
        <Tile label="Фото" tone="cyan" onClick={onPickImage} icon={<PhotoIcon />} />
        <Tile label="Файл" tone="violet" onClick={onPickFile} icon={<FileIcon />} />
        <Tile
          label="Смайлы"
          tone="cyan"
          onClick={onOpenEmoji}
          icon={<SmileIcon />}
        />
        <Tile label="Сторис" tone="gold" icon={<StarIcon />} href="/motivation" />
        <Tile label="Объявление" tone="gold" icon={<NoticeIcon />} href="/notices" />
        <Tile label="Товар" tone="cyan" icon={<CartIcon />} href="/market" />
        <Tile label="Контакт" tone="violet" icon={<PersonIcon />} href="/chat/people" />
        {onOpenAssistant && (
          <Tile
            label="Ассистент"
            tone="cyan"
            onClick={onOpenAssistant}
            icon={<BotIcon />}
          />
        )}
        <Tile label="Закрыть" tone="plain" onClick={onClose} icon={<CloseIcon />} />
      </div>
    </div>
  );
}

const TONES = {
  cyan: "border-cyan/34 bg-cyan/12 text-cyan",
  gold: "border-gold/34 bg-gold/12 text-gold",
  violet: "border-[#B23EFF]/34 bg-[#B23EFF]/12 text-[#C68BFF]",
  plain: "border-glass-brd bg-white/5 text-text-1",
} as const;

function Tile({
  label,
  icon,
  tone,
  onClick,
  href,
}: {
  label: string;
  icon: ReactNode;
  tone: keyof typeof TONES;
  onClick?: () => void;
  /** Плитка-переход в сервис, где карточку выбирают. */
  href?: string;
}) {
  const inside = (
    <>
      <span
        className={`flex size-14 items-center justify-center rounded-[18px] border ${TONES[tone]}`}
      >
        {icon}
      </span>
      <span className="text-center text-xs font-medium leading-4 text-text-1">
        {label}
      </span>
    </>
  );

  // Карточку выбирают в её сервисе: плитка — обычная ссылка туда.
  if (href)
    return (
      <Link
        href={href}
        className="flex flex-col items-center gap-2 transition-transform hover:-translate-y-0.5"
      >
        {inside}
      </Link>
    );

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 transition-transform hover:-translate-y-0.5"
    >
      {inside}
    </button>
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
