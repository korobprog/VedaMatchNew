"use client";

import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { TelegramIcon } from "@/components/quick/telegram-icon";
import {
  isTourShareDismissed,
  tourChapterUrl,
  tourShareLink,
  type TourShareTarget,
} from "@/lib/tour-share";

const TARGETS: { target: TourShareTarget; label: string }[] = [
  { target: "telegram", label: "Telegram" },
  { target: "whatsapp", label: "WhatsApp" },
  { target: "vk", label: "ВКонтакте" },
];

const pill =
  "inline-flex min-h-11 items-center gap-2 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-0 transition-colors hover:border-cyan/60";

/**
 * «Поделиться видео» под главой тура (VED-653). Системное окно — где оно
 * есть (телефон), рядом всегда мессенджеры и копия ссылки: на компьютере
 * окна нет, а страницу открывают гости без входа.
 */
export function TourShare({
  chapterId,
  title,
  text,
}: {
  chapterId: string;
  title: string;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  function url() {
    return tourChapterUrl(window.location.origin, chapterId);
  }

  async function shareNative() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url: url() });
        return;
      } catch (error) {
        if (isTourShareDismissed(error)) return;
      }
    }
    await copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Буфер закрыт (старый браузер, iframe) — остаются мессенджеры.
    }
  }

  function open(target: TourShareTarget) {
    window.open(
      tourShareLink(target, url(), text),
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold uppercase tracking-widest text-text-1">
        Поделиться видео
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void shareNative()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
        >
          <Share2 aria-hidden className="size-4" />
          Поделиться
        </button>
        {TARGETS.map(({ target, label }) => (
          <button
            key={target}
            type="button"
            onClick={() => open(target)}
            aria-label={`Поделиться в ${label}`}
            className={pill}
          >
            {target === "telegram" && (
              <TelegramIcon className="size-4 text-cyan" />
            )}
            {label}
          </button>
        ))}
        <button type="button" onClick={() => void copy()} className={pill}>
          {copied ? (
            <Check aria-hidden className="size-4 text-cyan" />
          ) : (
            <Link2 aria-hidden className="size-4" />
          )}
          {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
        </button>
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Ссылка на видео скопирована" : ""}
      </span>
    </div>
  );
}
