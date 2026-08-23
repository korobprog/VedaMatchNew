"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LibrarySectionRequestDto } from "@vedamatch/shared";
import { decideLibrarySectionRequest } from "@/lib/library-admin-api";

/**
 * Заявки на разделы, ждущие решения.
 *
 * «Одобрить» заводит раздел названиями из заявки — переписывать их руками
 * значит получить раздел, не совпадающий с одобренным. Автор в обоих
 * случаях получает уведомление, поэтому у отказа есть поле причины: без
 * неё человек узнаёт только факт отказа и приходит спрашивать снова.
 */
export function LibrarySectionRequests({
  initialRequests,
}: {
  initialRequests: LibrarySectionRequestDto[];
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, action: "approve" | "reject") {
    setError(null);
    setBusyId(id);
    try {
      await decideLibrarySectionRequest(id, action, comments[id]);
      setRequests((current) => current.filter((item) => item.id !== id));
      // Раздел мог появиться — список разделов выше должен это увидеть.
      router.refresh();
    } catch {
      setError("Не получилось применить решение");
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0)
    return (
      <p className="rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
        Заявок на разделы нет.
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-magenta">{error}</p>}

      <ul className="flex flex-col gap-3">
        {requests.map((request) => (
          <li
            key={request.id}
            className="flex flex-col gap-2 rounded-2xl border border-glass-brd p-4"
          >
            <p className="text-sm font-semibold text-text-0">
              {request.titleRu} · {request.titleEn}
            </p>
            {request.reason && (
              <p className="text-sm text-text-1">{request.reason}</p>
            )}
            <p className="text-xs text-text-2">
              {request.requestedByName ?? "—"} ·{" "}
              {new Date(request.createdAt).toLocaleDateString("ru-RU")}
            </p>

            <input
              value={comments[request.id] ?? ""}
              onChange={(event) =>
                setComments((current) => ({
                  ...current,
                  [request.id]: event.target.value,
                }))
              }
              placeholder="Комментарий — при отказе это причина"
              aria-label={`Комментарий к заявке «${request.titleRu}»`}
              className="rounded-xl border border-glass-brd bg-bg-0 p-2 text-sm text-text-0"
            />

            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === request.id}
                onClick={() => void decide(request.id, "approve")}
                className="rounded-xl bg-glass-brd/40 px-3 py-1.5 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
              >
                Одобрить и создать
              </button>
              <button
                type="button"
                disabled={busyId === request.id}
                onClick={() => void decide(request.id, "reject")}
                className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-magenta disabled:opacity-50"
              >
                Отклонить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
