"use client";

import { useEffect, useState } from "react";
import { BellOff, Loader2 } from "lucide-react";
import type {
  NoticeRubricDto,
  NoticeSubscriptionDto,
} from "@vedamatch/shared";
import {
  NoticesApiError,
  getNoticeRubrics,
  getNoticeSubscriptions,
  subscribeToNotices,
  unsubscribeFromNotices,
} from "@/lib/notices-api";

const KIND_LABELS: Record<NoticeSubscriptionDto["kind"], string> = {
  rubric: "Рубрика",
  city: "Город",
  community: "Община",
};

export function NoticesSubscriptionsView() {
  const [items, setItems] = useState<NoticeSubscriptionDto[]>([]);
  const [rubrics, setRubrics] = useState<NoticeRubricDto[]>([]);
  const [rubricSlug, setRubricSlug] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getNoticeSubscriptions(), getNoticeRubrics()])
      .then(([subs, cat]) => {
        if (!alive) return;
        setItems(subs.items);
        setRubrics(cat.items);
      })
      .catch((e: unknown) => {
        if (alive)
          setError(
            e instanceof NoticesApiError ? e.message : "Не удалось загрузить",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setItems((await getNoticeSubscriptions()).items);
    } catch (e) {
      setError(e instanceof NoticesApiError ? e.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-text-1">
        <Loader2 className="size-4 animate-spin" /> Загружаем…
      </p>
    );

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="glass mb-6 space-y-3 rounded-2xl border border-glass-brd p-4">
        <p className="text-sm text-text-1">
          Пришлём уведомление, когда появится новое объявление. Один человек —
          одно уведомление, даже если подходит и рубрика, и город.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex gap-2">
            <select
              value={rubricSlug}
              onChange={(event) => setRubricSlug(event.target.value)}
              className="flex-1 rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0"
            >
              <option value="">Выберите рубрику</option>
              {rubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.slug} className="bg-bg-0">
                  {rubric.nameRu}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !rubricSlug}
              onClick={() =>
                act(() => subscribeToNotices({ kind: "rubric", rubricSlug }))
              }
              className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
            >
              Подписаться
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Город"
              className="flex-1 rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
            />
            <button
              type="button"
              disabled={busy || !city.trim()}
              onClick={() =>
                act(async () => {
                  await subscribeToNotices({ kind: "city", city });
                  setCity("");
                })
              }
              className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
            >
              Подписаться
            </button>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Подписок пока нет.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((subscription) => (
            <li
              key={subscription.id}
              className="glass flex items-center gap-3 rounded-xl border border-glass-brd p-4"
            >
              <span className="rounded-full border border-glass-brd px-2 py-0.5 text-xs text-text-2">
                {KIND_LABELS[subscription.kind]}
              </span>
              <span className="text-text-0">{subscription.title}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(() => unsubscribeFromNotices(subscription.id))
                }
                className="ml-auto flex items-center gap-1.5 text-sm text-text-2 hover:text-red-400 disabled:opacity-50"
              >
                <BellOff className="size-4" />
                Отписаться
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
