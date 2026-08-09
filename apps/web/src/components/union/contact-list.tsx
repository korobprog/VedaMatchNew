"use client";

import { useState } from "react";
import type { UnionVisibleContacts } from "@vedamatch/shared";

const messengerLabels: Record<string, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  mx: "MAX",
  phone: "Телефон",
};

const socialLabels: Record<string, string> = {
  instagram: "Instagram",
  telegram: "Telegram",
  x: "X (Twitter)",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  vk: "ВКонтакте",
  tiktok: "TikTok",
  youtube: "YouTube",
  website: "Сайт",
};

/**
 * Строит ссылку из значения контакта. Значения приходят в свободной форме
 * (`@username`, номер телефона, готовая ссылка) — если это уже URL/tel/mailto,
 * используем как есть; иначе достраиваем по известной схеме платформы.
 * `null` — платформа без надёжной схемы диплинка (например MAX), контакт
 * остаётся только текстом с кнопкой копирования.
 */
function buildHref(key: string, rawValue: string): string | null {
  const value = rawValue.trim();
  if (/^(https?:|tel:|mailto:)/i.test(value)) return value;

  switch (key) {
    case "telegram":
      return `https://t.me/${value.replace(/^@/, "")}`;
    case "whatsapp":
      return `https://wa.me/${value.replace(/[^\d]/g, "")}`;
    case "phone":
      return `tel:${value.replace(/[^\d+]/g, "")}`;
    case "instagram":
      return `https://instagram.com/${value.replace(/^@/, "")}`;
    case "x":
      return `https://x.com/${value.replace(/^@/, "")}`;
    case "facebook":
      return `https://facebook.com/${value}`;
    case "linkedin":
      return `https://linkedin.com/in/${value}`;
    case "vk":
      return `https://vk.com/${value.replace(/^@/, "")}`;
    case "tiktok":
      return `https://tiktok.com/@${value.replace(/^@/, "")}`;
    case "youtube":
      return `https://youtube.com/${value}`;
    case "website":
      return `https://${value}`;
    default:
      return null;
  }
}

interface ContactItem {
  itemKey: string;
  label: string;
  value: string;
  href: string | null;
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.5 13.5H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h8A1.5 1.5 0 0 1 13.5 4v.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M4 10.5l3.5 3.5L16 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ContactList({ contacts }: { contacts: UnionVisibleContacts }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const items: ContactItem[] = [
    ...Object.entries(contacts.messengers).map(([key, value]) => ({
      itemKey: `messenger-${key}`,
      label: messengerLabels[key] ?? key,
      value: value ?? "",
      href: value ? buildHref(key, value) : null,
    })),
    ...Object.entries(contacts.socialLinks).map(([key, value]) => ({
      itemKey: `social-${key}`,
      label: socialLabels[key] ?? key,
      value: value ?? "",
      href: value ? buildHref(key, value) : null,
    })),
  ].filter((item) => item.value);

  if (items.length === 0) return null;

  async function copy(itemKey: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(itemKey);
      setTimeout(() => setCopiedKey((current) => (current === itemKey ? null : current)), 1500);
    } catch {
      // Буфер обмена недоступен (нет разрешения/HTTPS) — молча игнорируем.
    }
  }

  return (
    <details open className="rounded-xl border border-cyan/30 bg-cyan/10 text-sm text-text-0">
      <summary className="cursor-pointer select-none p-3 font-medium">
        Контакты открыты
      </summary>
      <div className="space-y-1 p-3 pt-0">
        {items.map((item) => (
          <div
            key={item.itemKey}
            className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 hover:bg-cyan/10"
          >
            <div className="min-w-0 truncate">
              <span className="font-medium">{item.label}:</span>{" "}
              {item.href ? (
                <a
                  href={item.href}
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel={item.href.startsWith("http") ? "noreferrer noopener" : undefined}
                  className="underline decoration-dotted underline-offset-2 hover:text-cyan"
                >
                  {item.value}
                </a>
              ) : (
                <span>{item.value}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => copy(item.itemKey, item.value)}
              aria-label={`Скопировать ${item.label}`}
              className="shrink-0 rounded-md p-1 text-text-2 transition hover:bg-cyan/20 hover:text-text-0"
            >
              {copiedKey === item.itemKey ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}
