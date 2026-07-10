"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type {
  UnionConnectionRequestDto,
  UnionConnectionRequestsState,
} from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ConnectionTab = "incoming" | "outgoing" | "accepted";
type ConnectionAction = "accept" | "decline";

const tabLabels: Record<ConnectionTab, string> = {
  incoming: "Входящие",
  outgoing: "Исходящие",
  accepted: "Принятые",
};

const emptyMessages: Record<ConnectionTab, string> = {
  incoming: "Новых входящих заявок пока нет.",
  outgoing: "Исходящих заявок пока нет.",
  accepted: "Принятых связей пока нет.",
};

const statusLabels: Record<UnionConnectionRequestDto["status"], string> = {
  pending: "Ожидает ответа",
  accepted: "Принято",
  declined: "Отклонено",
  cancelled: "Отменено",
};

export function buildAcceptedConnections(
  requests: UnionConnectionRequestsState,
): UnionConnectionRequestDto[] {
  const unique = new Map<string, UnionConnectionRequestDto>();
  for (const request of [...requests.incoming, ...requests.outgoing]) {
    if (request.status === "accepted") unique.set(request.id, request);
  }
  return [...unique.values()].sort(
    (left, right) =>
      Date.parse(right.respondedAt ?? right.createdAt) -
      Date.parse(left.respondedAt ?? left.createdAt),
  );
}

export function ConnectionsPanel({
  requests,
  loadError,
}: {
  requests: UnionConnectionRequestsState | null;
  loadError?: string | null;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ConnectionTab>("incoming");
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const lists = useMemo(() => {
    if (!requests) return null;
    return {
      incoming: [...requests.incoming].sort((left, right) => {
        if (left.status === "pending" && right.status !== "pending") return -1;
        if (left.status !== "pending" && right.status === "pending") return 1;
        return Date.parse(right.createdAt) - Date.parse(left.createdAt);
      }),
      outgoing: [...requests.outgoing].sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt),
      ),
      accepted: buildAcceptedConnections(requests),
    };
  }, [requests]);

  if (!lists) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        {loadError ??
          "Не удалось загрузить связи. Обновите страницу и попробуйте снова."}
      </div>
    );
  }

  const activeRequests = lists[activeTab];

  async function respond(requestId: string, action: ConnectionAction) {
    setPendingRequestId(requestId);
    setActionError(null);
    try {
      const response = await fetch(
        `${API_URL}/union/connection-requests/${requestId}/${action}`,
        { method: "PATCH", credentials: "include" },
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Не удалось выполнить действие");
      }
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось выполнить действие",
      );
    } finally {
      setPendingRequestId(null);
    }
  }

  return (
    <section>
      <div
        role="tablist"
        aria-label="Списки связей"
        className="mb-5 flex flex-wrap gap-2"
      >
        {(Object.keys(tabLabels) as ConnectionTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls="connections-list"
            onClick={() => setActiveTab(tab)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "bg-amber-600 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:border-amber-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
            }`}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {actionError && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {actionError}
        </p>
      )}

      <div id="connections-list" role="tabpanel" className="space-y-4">
        {activeRequests.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            {emptyMessages[activeTab]}
          </div>
        ) : (
          activeRequests.map((request) => (
            <ConnectionCard
              key={request.id}
              request={request}
              pending={pendingRequestId === request.id}
              onRespond={respond}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ConnectionCard({
  request,
  pending,
  onRespond,
}: {
  request: UnionConnectionRequestDto;
  pending: boolean;
  onRespond: (requestId: string, action: ConnectionAction) => Promise<void>;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start gap-4">
        {request.user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={request.user.avatarUrl}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            {request.user.name.charAt(0).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Link
                href={`/union/users/${request.user.id}`}
                className="font-semibold text-zinc-900 hover:text-amber-700 hover:underline dark:text-zinc-100 dark:hover:text-amber-400"
              >
                {request.user.name}
              </Link>
              <p className="text-sm text-zinc-500">
                {[request.user.city, request.user.country]
                  .filter(Boolean)
                  .join(", ") || "Город не указан"}
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {statusLabels[request.status]}
            </span>
          </div>

          <time
            dateTime={request.respondedAt ?? request.createdAt}
            className="mt-2 block text-xs text-zinc-400"
          >
            {new Date(request.respondedAt ?? request.createdAt).toLocaleDateString(
              "ru-RU",
            )}
          </time>

          {request.message && (
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {request.message}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {request.status === "pending" &&
              request.direction === "incoming" && (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onRespond(request.id, "accept")}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-wait disabled:bg-zinc-300"
                  >
                    Принять
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onRespond(request.id, "decline")}
                    className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-wait disabled:text-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Отклонить
                  </button>
                </>
              )}
            {request.status === "accepted" && (
              <Link
                href={`/union/chats/${request.id}`}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Открыть чат
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
