"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SubscriptionState } from "@vedamatch/shared";
import { formatDate, subscriptionStatusLabels } from "@/lib/support-labels";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Ручная активация подписки: оплату пользователь подтверждает через тикет,
 * администратор продлевает доступ здесь.
 */
export function AdminSubscriptionForm({
  userId,
  subscription,
}: {
  userId: string;
  subscription: SubscriptionState;
}) {
  const router = useRouter();
  const [note, setNote] = useState(subscription.note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/billing/users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message ?? "Не удалось обновить подписку");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить подписку");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2">
        <Row label="Статус" value={subscriptionStatusLabels[subscription.status]} />
        <Row
          label="Доступ до"
          value={
            subscription.accessUntil
              ? `${formatDate(subscription.accessUntil)} (дней: ${subscription.daysLeft})`
              : "Закончился"
          }
        />
        <Row
          label="Пробный период до"
          value={subscription.trialEndsAt ? formatDate(subscription.trialEndsAt) : "—"}
        />
        <Row
          label="Оплачено до"
          value={subscription.paidUntil ? formatDate(subscription.paidUntil) : "Не оплачивалось"}
        />
      </dl>

      <div className="flex flex-wrap gap-2">
        {[1, 3, 12].map((months) => (
          <button
            key={months}
            type="button"
            disabled={pending}
            onClick={() => void update({ addMonths: months })}
            className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            +{months} мес
          </button>
        ))}
        <button
          type="button"
          disabled={pending || !subscription.paidUntil}
          onClick={() => void update({ paidUntil: null })}
          className="rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          Сбросить оплату
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
          Комментарий к оплате (виден пользователю)
        </span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={500}
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() => void update({ note })}
        className="rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
      >
        Сохранить комментарий
      </button>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-text-2">{label}</dt>
      <dd className="text-sm text-text-0">{value}</dd>
    </div>
  );
}
