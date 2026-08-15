"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MarketChatSummary } from "@vedamatch/shared";
import { marketErrorCode, marketErrorText } from "./use-market-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * «Написать продавцу». Если диалог уже есть, сразу ведём в него — заводить
 * второй нельзя: диалог один на пару «магазин + покупатель».
 */
export function StartChatButton({
  shopId,
  listingId,
  orderId,
  existingConversationId,
  label,
}: {
  shopId: string;
  listingId?: string;
  orderId?: string;
  existingConversationId?: string | null;
  label: string;
}) {
  const t = useTranslations("Market");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    if (pending) return;
    if (existingConversationId) {
      router.push(`/market/chats/${existingConversationId}`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/market/chats`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          listingId: listingId ?? null,
          orderId: orderId ?? null,
        }),
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      const chat = (await res.json()) as MarketChatSummary;
      router.push(`/market/chats/${chat.id}`);
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void open()}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-2 hover:text-text-0 disabled:opacity-50"
      >
        <MessageSquare aria-hidden className="h-4 w-4" />
        {label}
      </button>
      {error && (
        <p className="mt-2 text-sm text-magenta">{marketErrorText(t, error)}</p>
      )}
    </div>
  );
}
