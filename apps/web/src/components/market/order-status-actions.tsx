"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MarketOrderStatus } from "@vedamatch/shared";
import { marketErrorCode, marketErrorText } from "./use-market-error";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Переходы, при которых уместно спросить причину. */
const NEEDS_REASON: MarketOrderStatus[] = [
  "declined_by_seller",
  "cancelled_by_buyer",
];

export function OrderStatusActions({
  orderId,
  transitions,
}: {
  orderId: string;
  transitions: MarketOrderStatus[];
}) {
  const t = useTranslations("Market");
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (transitions.length === 0) return null;

  async function apply(status: MarketOrderStatus) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/market/orders/${orderId}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          reason: NEEDS_REASON.includes(status) ? reason.trim() || null : null,
        }),
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      router.refresh();
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  const showReason = transitions.some((status) => NEEDS_REASON.includes(status));

  return (
    <div className="glass rounded-2xl border border-glass-brd p-4">
      {showReason && (
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("orders.reasonPlaceholder")}
          maxLength={500}
          className="mb-3 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
      )}

      <div className="flex flex-wrap gap-2">
        {transitions.map((status) => {
          const destructive = NEEDS_REASON.includes(status);
          return (
            <button
              key={status}
              type="button"
              disabled={pending}
              onClick={() => void apply(status)}
              className={
                destructive
                  ? "rounded-xl border border-magenta/40 px-3 py-1.5 text-sm text-magenta hover:bg-magenta/10 disabled:opacity-50"
                  : "rounded-xl bg-glass-brd/40 px-3 py-1.5 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
              }
            >
              {t(`orders.action.${status}`)}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-2 text-sm text-magenta">{marketErrorText(t, error)}</p>
      )}
    </div>
  );
}
