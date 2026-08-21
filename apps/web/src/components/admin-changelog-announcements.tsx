"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  AdminAnnouncementDto,
  AnnouncementAudienceStage,
  AnnouncementStatus,
  BroadcastAnnouncementResult,
} from "@vedamatch/shared";
import {
  ANNOUNCEMENT_AUDIENCE_LABELS,
  ANNOUNCEMENT_AUDIENCE_STAGES,
} from "@vedamatch/shared";
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
          {item.pinned && (
            <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs text-gold">
              закреплена
            </span>
          )}
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
      {(item.publishAt || item.expiresAt) && (
        <p className="mt-2 text-xs text-text-2">
          {item.publishAt && `Выйдет ${formatWhen(item.publishAt)}. `}
          {item.expiresAt && `Снимется ${formatWhen(item.expiresAt)}.`}
        </p>
      )}
      {item.status === "published" && <Broadcast item={item} />}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Рассылка новости. Отдельным действием после публикации: новость на главной
 * никого не беспокоит, а колокольчик и push — беспокоят, и решать это должен
 * человек. Пустой выбор ступеней означает «всем».
 */
function Broadcast({ item }: { item: AdminAnnouncementDto }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stages, setStages] = useState<AnnouncementAudienceStage[]>([]);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BroadcastAnnouncementResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(stage: AnnouncementAudienceStage) {
    setStages((current) =>
      current.includes(stage)
        ? current.filter((value) => value !== stage)
        : [...current, stage],
    );
  }

  async function send() {
    const audience =
      stages.length === 0
        ? "всем участникам"
        : stages.map((stage) => ANNOUNCEMENT_AUDIENCE_LABELS[stage]).join(", ");
    if (!confirm(`Разослать «${item.titleRu}» — ${audience}?`)) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(
        `${API_URL}/admin/changelog/announcements/${item.id}/broadcast`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stages.length > 0 ? { stages } : {}),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setResult((await res.json()) as BroadcastAnnouncementResult);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось разослать");
    } finally {
      setPending(false);
    }
  }

  if (!open)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl border border-glass-brd px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0"
        >
          🔔 Разослать участникам
        </button>
        {item.broadcastAt && (
          <span className="text-xs text-text-2">
            Уже рассылали {formatWhen(item.broadcastAt)} · {item.broadcastCount}{" "}
            получателей
          </span>
        )}
      </div>
    );

  return (
    <div className="mt-3 rounded-xl border border-glass-brd bg-bg-1/60 p-3">
      <p className="text-xs text-text-2">
        Кому отправить. Ничего не отмечено — уйдёт всем участникам портала.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ANNOUNCEMENT_AUDIENCE_STAGES.map((stage) => (
          <button
            key={stage}
            type="button"
            aria-pressed={stages.includes(stage)}
            onClick={() => toggle(stage)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              stages.includes(stage)
                ? "border-cyan bg-cyan/10 text-text-0"
                : "border-glass-brd text-text-1"
            }`}
          >
            {ANNOUNCEMENT_AUDIENCE_LABELS[stage]}
          </button>
        ))}
      </div>
      {item.broadcastAt && !result && (
        <p className="mt-2 text-xs text-gold">
          Эту новость уже рассылали {formatWhen(item.broadcastAt)} — повтор придёт
          людям второй раз.
        </p>
      )}
      {result && (
        <p className="mt-2 text-xs text-cyan">
          Отправлено: {result.recipients} участникам. У кого выключена категория
          «Новости» или нет подписки — не получат.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={send}
          className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Отправляем…" : "Отправить"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl px-3 py-2 text-xs font-medium text-text-2 hover:text-text-0"
        >
          Закрыть
        </button>
      </div>
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
  const [pinned, setPinned] = useState(item?.pinned ?? false);
  // `datetime-local` понимает только «YYYY-MM-DDTHH:mm» и работает в местном
  // времени, поэтому ISO из ответа режем и сдвигаем.
  const [publishAt, setPublishAt] = useState(toLocalInput(item?.publishAt));
  const [expiresAt, setExpiresAt] = useState(toLocalInput(item?.expiresAt));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const body = {
        titleRu,
        titleEn,
        bodyRu,
        bodyEn,
        status,
        pinned,
        publishAt: publishAt ? new Date(publishAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
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

      <label className="flex items-center gap-2 text-sm text-text-1">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
          className="h-4 w-4 accent-[color:var(--vm-gold)]"
        />
        Закрепить на главной
        <span className="text-xs text-text-2">
          (закреплённая всегда одна — прежняя открепится)
        </span>
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="text-sm text-text-1">
          Показать не раньше
          <input
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            className="mt-1 block rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
        <label className="text-sm text-text-1">
          Снять с главной
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 block rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
      </div>

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

/** ISO → значение `datetime-local` в местном времени; пусто, если даты нет. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}
