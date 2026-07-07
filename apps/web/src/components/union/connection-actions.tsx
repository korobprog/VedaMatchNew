"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UnionConnectionSummary } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function ConnectionActions({
  userId,
  connection,
}: {
  userId: string;
  connection: UnionConnectionSummary | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(path: string, init?: RequestInit) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Действие не выполнено");
    } finally {
      setPending(false);
    }
  }

  if (connection?.status === "accepted") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium text-emerald-600">
          Матч подтверждён: контакты открыты, если позволяет приватность.
        </p>
        <Link
          href={`/union/chats/${connection.id}`}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Открыть чат
        </Link>
      </div>
    );
  }

  if (connection?.status === "pending" && connection.direction === "outgoing") {
    return <p className="text-sm text-zinc-500">Запрос на знакомство отправлен.</p>;
  }

  if (connection?.status === "pending" && connection.direction === "incoming") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              request(`/union/connection-requests/${connection.id}/accept`, {
                method: "PATCH",
              })
            }
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-zinc-300"
          >
            Принять
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              request(`/union/connection-requests/${connection.id}/decline`, {
                method: "PATCH",
              })
            }
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Отклонить
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          request("/union/connection-requests", {
            method: "POST",
            body: JSON.stringify({ toUserId: userId }),
          })
        }
        className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:bg-zinc-300"
      >
        {pending ? "Отправка..." : "Отправить запрос"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
