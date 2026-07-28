"use client";

import { useState } from "react";
import type { UserProfile } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Заявка на проверку фото. Значок подтверждает конкретный набор снимков и
 * снимается автоматически, как только галерея меняется.
 */
export function PhotoVerificationPanel({
  profile,
  onUpdated,
}: {
  profile: UserProfile;
  onUpdated: (profile: UserProfile) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = profile.photoVerification.status;

  async function request() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/profile/photo-verification`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      onUpdated((await res.json()) as UserProfile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить заявку");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Проверка фото
      </h2>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Администрация сверяет открытые фото галереи с живым человеком. Значок
        «Фото проверено» в знакомствах повышает доверие к анкете и снимается,
        если вы измените состав фотографий.
      </p>

      {status === "verified" ? (
        <p className="text-sm font-medium text-emerald-600">
          Фото проверены администрацией.
        </p>
      ) : status === "requested" ? (
        <p className="text-sm text-zinc-500">
          Заявка отправлена — ожидайте решения администрации.
        </p>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={request}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {pending ? "Отправляем..." : "Запросить проверку фото"}
        </button>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
