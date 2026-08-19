"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminRoadmapItemDto, RoadmapStatus } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const statusLabels: Record<RoadmapStatus, string> = {
  planned: "В планах",
  in_progress: "В работе",
  done: "Готово",
};

export function AdminChangelogRoadmap({
  items,
}: {
  items: AdminRoadmapItemDto[];
}) {
  const [isCreating, setIsCreating] = useState(false);

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <RoadmapCard key={item.id} item={item} />
      ))}

      {isCreating ? (
        <RoadmapForm onDone={() => setIsCreating(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0"
        >
          Добавить пункт
        </button>
      )}
    </div>
  );
}

function RoadmapCard({ item }: { item: AdminRoadmapItemDto }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Удалить пункт «${item.titleRu}»?`)) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/admin/changelog/roadmap/${item.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить пункт");
      setPending(false);
    }
  }

  if (isEditing) {
    return <RoadmapForm item={item} onDone={() => setIsEditing(false)} />;
  }

  return (
    <div className="glass rounded-2xl border border-glass-brd p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display font-semibold text-text-0">{item.titleRu}</p>
          <p className="text-xs text-text-2">{item.titleEn}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-glass-brd px-2.5 py-1 text-xs text-text-1">
            {statusLabels[item.status]}
          </span>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0"
          >
            Редактировать
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            Удалить
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function RoadmapForm({
  item,
  onDone,
}: {
  item?: AdminRoadmapItemDto;
  onDone: () => void;
}) {
  const router = useRouter();
  const [titleRu, setTitleRu] = useState(item?.titleRu ?? "");
  const [titleEn, setTitleEn] = useState(item?.titleEn ?? "");
  const [descriptionRu, setDescriptionRu] = useState(item?.descriptionRu ?? "");
  const [descriptionEn, setDescriptionEn] = useState(item?.descriptionEn ?? "");
  const [status, setStatus] = useState<RoadmapStatus>(item?.status ?? "planned");
  const [sortOrder, setSortOrder] = useState(item?.sortOrder ?? 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const body = {
        titleRu,
        titleEn,
        descriptionRu: descriptionRu || null,
        descriptionEn: descriptionEn || null,
        status,
        sortOrder,
      };
      const url = item
        ? `${API_URL}/admin/changelog/roadmap/${item.id}`
        : `${API_URL}/admin/changelog/roadmap`;
      const res = await apiFetch(url, {
        method: item ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить пункт");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="glass rounded-2xl border border-glass-brd p-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        <input
          value={titleRu}
          onChange={(e) => setTitleRu(e.target.value)}
          placeholder="Заголовок (RU)"
          className="min-w-[160px] flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
        <input
          value={titleEn}
          onChange={(e) => setTitleEn(e.target.value)}
          placeholder="Заголовок (EN)"
          className="min-w-[160px] flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <input
          value={descriptionRu}
          onChange={(e) => setDescriptionRu(e.target.value)}
          placeholder="Описание (RU, необязательно)"
          className="min-w-[160px] flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
        <input
          value={descriptionEn}
          onChange={(e) => setDescriptionEn(e.target.value)}
          placeholder="Описание (EN, необязательно)"
          className="min-w-[160px] flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-text-1">
          Статус
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as RoadmapStatus)}
            className="rounded-xl border border-glass-brd bg-bg-1 px-2 py-2 text-sm text-text-0"
          >
            {(Object.keys(statusLabels) as RoadmapStatus[]).map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-text-1">
          Порядок
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-20 rounded-xl border border-glass-brd bg-bg-1 px-2 py-2 text-sm text-text-0"
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !titleRu || !titleEn}
          onClick={submit}
          className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Сохранить
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl px-4 py-2 text-sm font-medium text-text-2 hover:text-text-0"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
