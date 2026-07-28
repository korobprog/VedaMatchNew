"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserBlockDto } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function BlockedUsersPanel({ blocked }: { blocked: UserBlockDto[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unblock(userId: string) {
    setPendingId(userId);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/union/users/${userId}/block`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось разблокировать");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="glass rounded-2xl border border-glass-brd p-6">
      <h2 className="mb-2 text-lg font-semibold text-text-0">
        Заблокированные
      </h2>
      <p className="mb-4 text-sm text-text-1">
        Вы не видите друг друга в знакомствах и не можете отправлять запросы.
      </p>

      {blocked.length === 0 ? (
        <p className="text-sm text-text-2">Список пуст.</p>
      ) : (
        <ul className="space-y-2">
          {blocked.map((item) => (
            <li
              key={item.userId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-glass-brd bg-bg-1 px-4 py-3"
            >
              <span className="text-sm text-text-0">{item.name}</span>
              <button
                type="button"
                disabled={pendingId === item.userId}
                onClick={() => unblock(item.userId)}
                className="text-sm font-medium text-text-2 underline transition hover:text-text-0 disabled:opacity-50"
              >
                {pendingId === item.userId
                  ? "Разблокируем..."
                  : "Разблокировать"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </section>
  );
}
