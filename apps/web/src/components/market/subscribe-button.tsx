"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  MarketListingFilters,
  MarketSubscriptionDto,
  MarketSubscriptionKind,
} from "@vedamatch/shared";
import { marketErrorCode, marketErrorText } from "./use-market-error";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Подписка на новинки. Состояние приходит с сервера готовым (`existing`),
 * а не выясняется отдельным запросом: страница и так знает список подписок
 * зрителя, и лишний круг ради иконки не нужен.
 */
export function SubscribeButton({
  kind,
  shopId,
  sectionId,
  categoryId,
  query,
  existing,
  label,
}: {
  kind: MarketSubscriptionKind;
  shopId?: string;
  sectionId?: string;
  categoryId?: string;
  query?: MarketListingFilters;
  existing: MarketSubscriptionDto | null;
  label?: string;
}) {
  const t = useTranslations("Market");
  const router = useRouter();
  const [subscription, setSubscription] = useState(existing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (subscription) {
        const res = await apiFetch(
          `${API_URL}/market/subscriptions/${subscription.id}`,
          { method: "DELETE", credentials: "include" },
        );
        if (!res.ok) {
          setError(await marketErrorCode(res));
          return;
        }
        setSubscription(null);
      } else {
        const res = await apiFetch(`${API_URL}/market/subscriptions`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, shopId, sectionId, categoryId, query }),
        });
        if (!res.ok) {
          setError(await marketErrorCode(res));
          return;
        }
        setSubscription((await res.json()) as MarketSubscriptionDto);
      }
      router.refresh();
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  const active = Boolean(subscription);
  const text = active
    ? t("subscriptions.unsubscribe")
    : (label ?? t("subscriptions.subscribe"));

  return (
    <span>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={pending}
        aria-pressed={active}
        className={[
          "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors disabled:opacity-50",
          active
            ? "border-glass-brd bg-glass-brd/50 text-text-0"
            : "border-glass-brd text-text-2 hover:text-text-0",
        ].join(" ")}
      >
        {active ? (
          <BellOff aria-hidden className="h-4 w-4" />
        ) : (
          <Bell aria-hidden className="h-4 w-4" />
        )}
        {text}
      </button>
      {error && (
        <p className="mt-1 text-xs text-magenta">{marketErrorText(t, error)}</p>
      )}
    </span>
  );
}
