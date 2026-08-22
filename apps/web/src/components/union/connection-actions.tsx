"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UnionConnectionSummary } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const primaryButton =
  "flex-1 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2.5 text-sm font-semibold text-white transition hover:shadow-[0_0_20px_var(--vm-glow-magenta)] disabled:opacity-50 disabled:shadow-none";
const secondaryButton =
  "flex-1 rounded-xl glass border border-glass-brd px-4 py-2.5 text-sm font-medium text-text-1 transition hover:text-text-0 disabled:opacity-50";

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
      const res = await apiFetch(`${API_URL}${path}`, {
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
      <div className="space-y-2">
        <p className="text-sm font-medium text-cyan">
          Матч подтверждён — контакты открыты.
        </p>
        <Link
          href={`/chat/with/${userId}`}
          className="flex justify-center rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2.5 text-sm font-semibold text-white transition hover:shadow-[0_0_20px_var(--vm-glow-magenta)]"
        >
          Открыть чат
        </Link>
      </div>
    );
  }

  if (connection?.status === "pending" && connection.direction === "outgoing") {
    return <p className="text-sm text-text-2">Запрос на знакомство отправлен.</p>;
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
            className={primaryButton}
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
            className={secondaryButton}
          >
            Отклонить
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
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
        className={`w-full ${primaryButton}`}
      >
        {pending ? "Отправка..." : "Познакомиться"}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
