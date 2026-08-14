"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserAccountStatus } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function AdminUserBlockForm({
  userId,
  isSelf,
  accountStatus,
  blockedUntil,
  statusReason,
}: {
  userId: string;
  isSelf: boolean;
  accountStatus: UserAccountStatus;
  blockedUntil: string | null;
  statusReason: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBlocked = accountStatus === "blocked";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/block`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isBlocked
            ? { blocked: false }
            : { blocked: true, reason, blockedUntil: until || null },
        ),
      });
      if (!res.ok) throw new Error(await res.text());
      setReason("");
      setUntil("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить изменение");
    } finally {
      setPending(false);
    }
  }

  if (accountStatus === "deleted") return null;

  if (isSelf) {
    return (
      <div className="rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
        Нельзя заблокировать собственный аккаунт.
      </div>
    );
  }

  if (isBlocked) {
    return (
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-gold/30 bg-gold/5 p-4">
        <h3 className="font-semibold text-text-0">Аккаунт заблокирован</h3>
        <p className="text-sm text-text-1">Причина: {statusReason || "—"}</p>
        <p className="text-sm text-text-1">
          {blockedUntil ? `До: ${new Date(blockedUntil).toLocaleString("ru-RU")}` : "Бессрочно"}
        </p>
        {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
        <button
          disabled={pending}
          className="rounded-xl bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold/90 disabled:bg-zinc-400"
        >
          {pending ? "Снимаем…" : "Снять блокировку"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-gold/30 bg-gold/5 p-4">
      <h3 className="font-semibold text-text-0">Блокировка аккаунта</h3>
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <label className="block text-sm font-medium text-text-1">
        Причина
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-text-0"
          placeholder="Минимум 5 символов"
        />
      </label>
      <label className="block text-sm font-medium text-text-1">
        Заблокировать до (необязательно)
        <input
          type="datetime-local"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-text-0"
        />
      </label>
      <button
        disabled={pending || reason.trim().length < 5}
        className="rounded-xl bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold/90 disabled:bg-zinc-400"
      >
        {pending ? "Блокируем…" : "Заблокировать"}
      </button>
    </form>
  );
}
