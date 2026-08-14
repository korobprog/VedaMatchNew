"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function DeleteAccountSection({
  pendingDeletionAt,
  deletionEligibleAt,
  className,
}: {
  pendingDeletionAt: string | null;
  deletionEligibleAt: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestDeletion() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/profile/delete-request`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Не удалось отправить запрос на удаление");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить запрос на удаление");
    } finally {
      setPending(false);
    }
  }

  async function cancelDeletion() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/profile/delete-request`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Не удалось отменить удаление");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отменить удаление");
    } finally {
      setPending(false);
    }
  }

  if (pendingDeletionAt) {
    return (
      <div className={cn("rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm", className)}>
        <p className="font-medium text-red-400">
          Аккаунт будет удалён {deletionEligibleAt ? new Date(deletionEligibleAt).toLocaleDateString("ru-RU") : ""}.
        </p>
        <p className="mt-1 text-text-1">До этого момента вы можете отменить удаление.</p>
        {error && <p className="mt-2 text-red-400">{error}</p>}
        <button
          type="button"
          onClick={cancelDeletion}
          disabled={pending}
          className="mt-3 rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 disabled:opacity-60"
        >
          {pending ? "Отменяем…" : "Отменить удаление"}
        </button>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-red-400/30 p-4 text-sm", className)}>
      <p className="font-medium text-text-0">Удаление аккаунта</p>
      <p className="mt-1 text-text-1">
        Аккаунт будет скрыт от других пользователей и удалён. В течение 14 дней удаление можно отменить.
      </p>
      <label className="mt-3 flex gap-2 text-text-1">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Я понимаю, что мой аккаунт будет удалён.
      </label>
      {error && <p className="mt-2 text-red-400">{error}</p>}
      <button
        type="button"
        onClick={requestDeletion}
        disabled={pending || !confirmed}
        className="mt-3 w-full rounded-xl border border-red-400/30 px-4 py-3 text-red-400 transition hover:border-red-400/50 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Отправляем…" : "Удалить аккаунт"}
      </button>
    </div>
  );
}
