"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationBroadcastDto } from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { formatDate } from "@/lib/admin-labels";
import { broadcastStatusLabels, describeAudience } from "@/lib/broadcast-labels";
import {
  cancelBroadcast,
  deleteBroadcast,
  sendBroadcast,
} from "@/lib/broadcasts-api";

export function BroadcastList({
  broadcasts,
}: {
  broadcasts: NotificationBroadcastDto[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<unknown>) {
    setPendingId(id);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить");
    } finally {
      setPendingId(null);
    }
  }

  if (broadcasts.length === 0) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        Рассылок ещё не было.
      </p>
    );
  }

  return (
    <>
      {error && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}
      <ul className="space-y-3">
        {broadcasts.map((broadcast) => (
          <li
            key={broadcast.id}
            className="glass rounded-2xl border border-glass-brd p-4"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-glass-brd px-2 py-0.5 text-text-1">
                {broadcastStatusLabels[broadcast.status]}
              </span>
              {broadcast.important && (
                <span className="rounded-full border border-magenta/40 px-2 py-0.5 text-text-1">
                  важное
                </span>
              )}
              <span className="text-text-2">
                {formatDate(broadcast.createdAt)}
                {broadcast.createdByName && ` · ${broadcast.createdByName}`}
              </span>
            </div>

            <p className="font-display font-semibold text-text-0">
              {broadcast.title}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-text-1">
              {broadcast.body}
            </p>
            {broadcast.url && (
              <p className="mt-1 font-mono text-xs text-text-2">
                {broadcast.url}
              </p>
            )}

            <p className="mt-2 text-xs text-text-2">
              Аудитория: {describeAudience(broadcast.audience)}
            </p>

            {broadcast.status !== "draft" && (
              <p className="mt-1 text-xs text-text-2">
                Доставлено {broadcast.deliveredCount} из{" "}
                {broadcast.totalRecipients} · пушей: {broadcast.pushSentCount}
              </p>
            )}

            {broadcast.errorMessage && (
              <p className="mt-1 text-xs text-text-1">
                Ошибка: {broadcast.errorMessage}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {broadcast.status === "draft" && (
                <>
                  <ActionButton
                    tone="primary"
                    disabled={pendingId === broadcast.id}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Отправить «${broadcast.title}»? Отменить после отправки нельзя.`,
                        )
                      )
                        return;
                      void run(broadcast.id, () => sendBroadcast(broadcast.id));
                    }}
                  >
                    Отправить
                  </ActionButton>
                  <ActionButton
                    disabled={pendingId === broadcast.id}
                    onClick={() => {
                      if (!window.confirm("Удалить черновик?")) return;
                      void run(broadcast.id, () =>
                        deleteBroadcast(broadcast.id),
                      );
                    }}
                  >
                    Удалить
                  </ActionButton>
                </>
              )}
              {broadcast.status === "sending" && (
                <ActionButton
                  disabled={pendingId === broadcast.id}
                  onClick={() =>
                    void run(broadcast.id, () => cancelBroadcast(broadcast.id))
                  }
                >
                  Остановить
                </ActionButton>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone = "plain",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "plain" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50",
        tone === "primary"
          ? "border-magenta/50 text-text-0 hover:bg-magenta/10"
          : "border-glass-brd text-text-1 hover:text-text-0",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
