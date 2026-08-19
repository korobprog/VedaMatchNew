"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminAnnouncementDto, AnnouncementStatus } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const statusLabels: Record<AnnouncementStatus, string> = {
  draft: "Черновик",
  published: "Опубликовано",
};

export function AdminChangelogAnnouncements({
  announcements,
}: {
  announcements: AdminAnnouncementDto[];
}) {
  const [isCreating, setIsCreating] = useState(false);

  return (
    <div className="space-y-4">
      {announcements.map((item) => (
        <AnnouncementCard key={item.id} item={item} />
      ))}

      {isCreating ? (
        <AnnouncementForm onDone={() => setIsCreating(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0"
        >
          Добавить новость
        </button>
      )}
    </div>
  );
}

function AnnouncementCard({ item }: { item: AdminAnnouncementDto }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Удалить новость «${item.titleRu}»?`)) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/admin/changelog/announcements/${item.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить новость");
      setPending(false);
    }
  }

  if (isEditing) {
    return <AnnouncementForm item={item} onDone={() => setIsEditing(false)} />;
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

function AnnouncementForm({
  item,
  onDone,
}: {
  item?: AdminAnnouncementDto;
  onDone: () => void;
}) {
  const router = useRouter();
  const [titleRu, setTitleRu] = useState(item?.titleRu ?? "");
  const [titleEn, setTitleEn] = useState(item?.titleEn ?? "");
  const [bodyRu, setBodyRu] = useState(item?.bodyRu ?? "");
  const [bodyEn, setBodyEn] = useState(item?.bodyEn ?? "");
  const [status, setStatus] = useState<AnnouncementStatus>(item?.status ?? "draft");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const body = { titleRu, titleEn, bodyRu, bodyEn, status };
      const url = item
        ? `${API_URL}/admin/changelog/announcements/${item.id}`
        : `${API_URL}/admin/changelog/announcements`;
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
      setError(e instanceof Error ? e.message : "Не удалось сохранить новость");
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
      <textarea
        value={bodyRu}
        onChange={(e) => setBodyRu(e.target.value)}
        placeholder="Текст (RU)"
        rows={3}
        className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
      />
      <textarea
        value={bodyEn}
        onChange={(e) => setBodyEn(e.target.value)}
        placeholder="Текст (EN)"
        rows={3}
        className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
      />
      <label className="flex items-center gap-2 text-sm text-text-1">
        Статус
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AnnouncementStatus)}
          className="rounded-xl border border-glass-brd bg-bg-1 px-2 py-2 text-sm text-text-0"
        >
          {(Object.keys(statusLabels) as AnnouncementStatus[]).map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !titleRu || !titleEn || !bodyRu || !bodyEn}
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
