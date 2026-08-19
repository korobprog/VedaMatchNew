"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserAccountStatus } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function AdminUserDeleteForm({
  userId,
  isSelf,
  accountStatus,
  deletedAt,
  statusReason,
}: {
  userId: string;
  isSelf: boolean;
  accountStatus: UserAccountStatus;
  deletedAt: string | null;
  statusReason: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmSelfDelete, setConfirmSelfDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/users/${userId}/restore`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось восстановить аккаунт");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/users/${userId}/delete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, confirmSelfDelete }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить аккаунт");
    } finally {
      setPending(false);
    }
  }

  if (accountStatus === "deleted") {
    return (
      <div className="space-y-3 rounded-2xl border border-red-400/30 bg-red-400/5 p-4">
        <h3 className="font-semibold text-text-0">Аккаунт удалён</h3>
        <p className="text-sm text-text-1">{deletedAt ? new Date(deletedAt).toLocaleString("ru-RU") : "—"}</p>
        <p className="text-sm text-text-1">Причина: {statusReason || "—"}</p>
        {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
        <button
          onClick={restore}
          disabled={pending}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          {pending ? "Восстанавливаем…" : "Восстановить аккаунт"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-red-400/30 bg-red-400/5 p-4">
      <h3 className="font-semibold text-red-500">Опасная зона</h3>
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <label className="block text-sm font-medium text-text-1">
        Причина удаления
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-text-0"
          placeholder="Минимум 5 символов"
        />
      </label>
      {isSelf && (
        <label className="flex gap-2 text-sm text-red-600 dark:text-red-300">
          <input
            type="checkbox"
            checked={confirmSelfDelete}
            onChange={(e) => setConfirmSelfDelete(e.target.checked)}
          />
          Я понимаю, что удаляю собственный аккаунт.
        </label>
      )}
      <button
        disabled={pending || reason.trim().length < 5 || (isSelf && !confirmSelfDelete)}
        className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-500/90 disabled:bg-zinc-400"
      >
        {pending ? "Удаляем…" : "Удалить аккаунт"}
      </button>
    </form>
  );
}
