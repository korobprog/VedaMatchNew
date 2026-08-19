"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { BillingMode } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const modeLabels: Record<BillingMode, string> = {
  beta: "Beta — доступ бесплатный для всех",
  business: "Business — обычный платный тариф",
};

export function AdminBillingModeForm({ initialMode }: { initialMode: BillingMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<BillingMode>(initialMode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (mode === initialMode) return;

    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/billing/mode`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить режим");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-magenta/30 bg-magenta/5 p-4"
    >
      <div>
        <h3 className="font-semibold text-text-0">Режим биллинга платформы</h3>
        <p className="mt-1 text-sm text-text-2">
          Влияет на лендинг, профиль и доступ ко всем сервисам сразу для всех пользователей.
          В режиме beta никто не платит и триал не истекает.
        </p>
      </div>
      {error && (
        <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {(["beta", "business"] as const).map((item) => (
          <label
            key={item}
            className="flex items-center gap-2 rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-1"
          >
            <input
              type="radio"
              name="billingMode"
              value={item}
              checked={mode === item}
              onChange={() => setMode(item)}
            />
            {modeLabels[item]}
          </label>
        ))}
      </div>
      <button
        disabled={pending || mode === initialMode}
        className="btn-mint rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Сохраняем…" : "Сохранить режим"}
      </button>
    </form>
  );
}
