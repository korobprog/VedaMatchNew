"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  AdminReleaseChangeDto,
  AdminReleaseDto,
  ReleaseChangeType,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const changeTypeLabels: Record<ReleaseChangeType, string> = {
  feature: "Новое",
  fix: "Исправление",
  improvement: "Улучшение",
};

interface ChangeRow {
  type: ReleaseChangeType;
  titleRu: string;
  titleEn: string;
}

function emptyRow(): ChangeRow {
  return { type: "feature", titleRu: "", titleEn: "" };
}

function toRows(changes: AdminReleaseChangeDto[]): ChangeRow[] {
  return changes.length
    ? changes.map((c) => ({ type: c.type, titleRu: c.titleRu, titleEn: c.titleEn }))
    : [emptyRow()];
}

export function AdminChangelogReleases({
  releases,
}: {
  releases: AdminReleaseDto[];
}) {
  const [isCreating, setIsCreating] = useState(false);

  return (
    <div className="space-y-4">
      {releases.map((release) => (
        <ReleaseCard key={release.id} release={release} />
      ))}

      {isCreating ? (
        <ReleaseForm onDone={() => setIsCreating(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0"
        >
          Добавить релиз
        </button>
      )}
    </div>
  );
}

function ReleaseCard({ release }: { release: AdminReleaseDto }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function makeCurrent() {
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(
        `${API_URL}/admin/changelog/releases/${release.id}/current`,
        { method: "PATCH", credentials: "include" },
      );
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить релиз");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!confirm(`Удалить релиз v${release.version}?`)) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/admin/changelog/releases/${release.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить релиз");
      setPending(false);
    }
  }

  if (isEditing) {
    return <ReleaseForm release={release} onDone={() => setIsEditing(false)} />;
  }

  return (
    <div className="glass rounded-2xl border border-glass-brd p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-display font-semibold text-text-0">v{release.version}</p>
          {release.isCurrent && (
            <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-xs font-medium text-magenta">
              Текущая
            </span>
          )}
          <span className="text-xs text-text-2">
            {new Date(release.releasedAt).toLocaleDateString("ru-RU")}
          </span>
        </div>
        <div className="flex gap-2">
          {!release.isCurrent && (
            <button
              type="button"
              disabled={pending}
              onClick={makeCurrent}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
            >
              Сделать текущей
            </button>
          )}
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

      <ul className="mt-3 space-y-1 text-sm text-text-1">
        {release.changes.map((change) => (
          <li key={change.id} className="flex gap-2">
            <span className="shrink-0 text-xs font-medium text-text-2">
              {changeTypeLabels[change.type]}
            </span>
            <span>{change.titleRu} / {change.titleEn}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReleaseForm({
  release,
  onDone,
}: {
  release?: AdminReleaseDto;
  onDone: () => void;
}) {
  const router = useRouter();
  const [version, setVersion] = useState(release?.version ?? "");
  const [releasedAt, setReleasedAt] = useState(
    release?.releasedAt ? release.releasedAt.slice(0, 10) : "",
  );
  const [rows, setRows] = useState<ChangeRow[]>(
    release ? toRows(release.changes) : [emptyRow()],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<ChangeRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const body = {
        version,
        releasedAt,
        changes: rows
          .filter((row) => row.titleRu.trim() || row.titleEn.trim())
          .map((row, index) => ({ ...row, sortOrder: index })),
      };
      const url = release
        ? `${API_URL}/admin/changelog/releases/${release.id}`
        : `${API_URL}/admin/changelog/releases`;
      const res = await apiFetch(url, {
        method: release ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить релиз");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="glass rounded-2xl border border-glass-brd p-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 min-w-[140px]">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
            Версия
          </span>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.4.0"
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
        <label className="flex-1 min-w-[140px]">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
            Дата релиза
          </span>
          <input
            type="date"
            value={releasedAt}
            onChange={(e) => setReleasedAt(e.target.value)}
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
      </div>

      <div className="space-y-2">
        <span className="block text-xs uppercase tracking-wide text-text-2">
          Изменения
        </span>
        {rows.map((row, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select
              value={row.type}
              onChange={(e) => updateRow(index, { type: e.target.value as ReleaseChangeType })}
              className="rounded-xl border border-glass-brd bg-bg-1 px-2 py-2 text-sm text-text-0"
            >
              {(Object.keys(changeTypeLabels) as ReleaseChangeType[]).map((type) => (
                <option key={type} value={type}>
                  {changeTypeLabels[type]}
                </option>
              ))}
            </select>
            <input
              value={row.titleRu}
              onChange={(e) => updateRow(index, { titleRu: e.target.value })}
              placeholder="Заголовок (RU)"
              className="min-w-[160px] flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
            />
            <input
              value={row.titleEn}
              onChange={(e) => updateRow(index, { titleEn: e.target.value })}
              placeholder="Заголовок (EN)"
              className="min-w-[160px] flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
            />
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Убрать
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, emptyRow()])}
          className="text-xs font-medium text-text-1 hover:text-text-0"
        >
          + добавить пункт
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !version || !releasedAt}
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
