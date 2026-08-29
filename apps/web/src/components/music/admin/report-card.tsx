"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  MusicAdminReportDto,
  MusicReportKind,
  MusicTrackStatus,
} from "@vedamatch/shared";
import { decideMusicReport } from "@/lib/music-admin-client-api";
import { Alert } from "@/components/ui/alert";

const KIND_LABEL: Record<MusicReportKind, string> = {
  copyright: "Права на запись",
  content: "Содержание",
  quality: "Качество файла",
};

const STATUS_LABEL: Record<MusicTrackStatus, string> = {
  draft: "черновик",
  pending: "ждёт разбора",
  published: "в каталоге",
  rejected: "отклонена",
  hidden: "скрыта",
};

/**
 * Жалоба в разборе.
 *
 * Два решения и никакого удаления: «подтвердить» оставляет запись скрытой,
 * «отклонить» возвращает её в каталог. Три аккаунта не должны становиться
 * кнопкой «удалить чужое» — это правило сервиса, и в интерфейсе его видно
 * тем, что третьей кнопки просто нет.
 *
 * Кто пожаловался, здесь не показано: решают по записи и тексту, а не по
 * тому, чьё имя стоит рядом.
 */
export function MusicReportCard({ report }: { report: MusicAdminReportDto }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "resolved" | "rejected") {
    setPending(true);
    setError(null);
    try {
      await decideMusicReport(report.id, {
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
      setPending(false);
    }
  }

  return (
    <article className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-magenta/40 bg-magenta/12 px-2.5 py-0.5 text-xs font-semibold text-magenta">
          {KIND_LABEL[report.kind]}
        </span>
        <span className="text-xs text-text-2">
          {STATUS_LABEL[report.track.status]}
        </span>
        {report.openOnTrack > 1 && (
          <span className="text-xs text-text-2">
            · жалоб на запись: {report.openOnTrack}
          </span>
        )}
        <time
          dateTime={report.createdAt}
          className="ml-auto font-mono text-[11px] text-text-2"
        >
          {new Date(report.createdAt).toLocaleDateString("ru")}
        </time>
      </div>

      <div className="flex flex-col gap-0.5">
        <Link
          href={`/music/tracks/${report.track.id}`}
          className="text-sm font-semibold text-text-0 hover:text-cyan"
        >
          {report.track.title}
        </Link>
        <span className="text-xs text-text-2">
          {report.track.artistName ?? "Исполнитель не указан"}
        </span>
      </div>

      <p className="whitespace-pre-line rounded-xl border border-glass-brd bg-bg-1 p-3 text-sm text-text-1">
        {report.text}
      </p>

      <label className="block">
        <span className="mb-1 block text-xs text-text-2">
          Причина решения — её увидит автор записи
        </span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="h-9 w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0"
          placeholder="Запись остаётся скрытой: права не подтверждены"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void decide("resolved")}
          className="h-9 rounded-xl border border-magenta/40 bg-magenta/12 px-4 text-sm font-semibold text-magenta disabled:opacity-50"
        >
          Жалоба справедлива
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void decide("rejected")}
          className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          Вернуть в каталог
        </button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
    </article>
  );
}
