"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, CalendarDays, Loader2, MapPin, Monitor } from "lucide-react";
import type { NoticeDto } from "@vedamatch/shared";
import {
  NoticesApiError,
  deleteNotice,
  getNotice,
  renewNotice,
  setNoticeStatus,
} from "@/lib/notices-api";
import {
  NOTICE_AUDIENCE_LABELS,
  NOTICE_KIND_LABELS,
  NOTICE_STATUS_LABELS,
  formatDate,
  formatEventTime,
  noticeDescription,
  noticeTitle,
} from "./notice-labels";
import { NoticeImagesUpload } from "./notice-images-upload";
import { NoticeReportDialog } from "./notice-report-dialog";
import { NoticeResponsesPanel } from "./notice-responses-panel";

export function NoticeDetailView({ id }: { id: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState<NoticeDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(() => {
    getNotice(id)
      .then(setNotice)
      .catch(() => {
        // Счётчики обновятся при следующем заходе — ронять карточку из-за
        // фонового обновления незачем.
      });
  }, [id]);

  useEffect(() => {
    let alive = true;
    getNotice(id)
      .then((found) => {
        if (alive) setNotice(found);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof NoticesApiError && e.status === 404) setNotFound(true);
        else setError(e instanceof NoticesApiError ? e.message : "Ошибка");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const act = useCallback(
    async (action: () => Promise<NoticeDto | void>) => {
      setBusy(true);
      setError(null);
      try {
        const updated = await action();
        if (updated) setNotice(updated);
      } catch (e) {
        setError(e instanceof NoticesApiError ? e.message : "Не получилось");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-text-1">
        <Loader2 className="size-4 animate-spin" /> Загружаем…
      </p>
    );

  if (notFound || !notice)
    return (
      <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        <p>Объявление не найдено — возможно, его сняли или срок вышел.</p>
        <Link href="/notices" className="mt-2 inline-block text-text-0 underline">
          Вернуться на доску
        </Link>
      </div>
    );

  const description = noticeDescription(notice);

  return (
    <div className="space-y-6">
      {notice.status !== "published" && (
        <p className="rounded-xl border border-glass-brd bg-glass px-4 py-3 text-sm text-text-1">
          {NOTICE_STATUS_LABELS[notice.status]}
          {notice.status === "expired" &&
            notice.isMine &&
            " — продлите, если ещё актуально."}
        </p>
      )}

      <div className="glass rounded-2xl border border-glass-brd p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-text-2">
          <span>{NOTICE_KIND_LABELS[notice.kind]}</span>
          <span>·</span>
          <span>{notice.rubric.nameRu}</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-text-0">
          {noticeTitle(notice)}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-1">
          {notice.startsAt && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" />
              {formatEventTime(notice.startsAt, notice.timeZone)}
              {notice.timeZone && (
                <span className="text-text-2">({notice.timeZone})</span>
              )}
            </span>
          )}
          {notice.city && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" />
              {notice.venueName ? `${notice.venueName}, ` : ""}
              {notice.city}
            </span>
          )}
          {notice.isOnline && (
            <span className="flex items-center gap-1.5">
              <Monitor className="size-4" />
              {notice.onlineUrl ? (
                <a
                  href={notice.onlineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Онлайн-встреча
                </a>
              ) : (
                "Онлайн"
              )}
            </span>
          )}
        </div>

        {notice.images.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {notice.images.map((image) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={image.id}
                src={image.url}
                alt=""
                className="w-full rounded-xl object-cover"
                loading="lazy"
              />
            ))}
          </div>
        )}

        {description && (
          <p className="mt-4 whitespace-pre-line text-sm text-text-1">
            {description}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-glass-brd pt-4 text-sm text-text-2">
          <span>
            {notice.postedAs ? "Опубликовала община" : "Опубликовал"}{" "}
          </span>
          {notice.postedAs ? (
            <Link
              href={`/communities/${notice.postedAs.slug}`}
              className="flex items-center gap-1 text-text-1 underline"
            >
              {notice.postedAs.isVerified && (
                <BadgeCheck className="size-4 text-emerald-400" />
              )}
              {notice.postedAs.name}
            </Link>
          ) : (
            <span className="text-text-1">{notice.author.name}</span>
          )}
          <span>· {formatDate(notice.publishedAt)}</span>
          <span>· до {formatDate(notice.expiresAt)}</span>
          {notice.thanksCount > 0 && (
            <span>· спасибо: {notice.thanksCount}</span>
          )}
        </div>

        {!notice.isMine && (
          <div className="mt-4 border-t border-glass-brd pt-4">
            <NoticeReportDialog noticeId={notice.id} />
          </div>
        )}
      </div>

      <NoticeResponsesPanel notice={notice} onChanged={refresh} />

      {!notice.isMine && notice.status === "published" && (
        <p className="rounded-xl border border-glass-brd bg-glass px-4 py-3 text-xs text-text-2">
          Договариваясь о встрече с незнакомым человеком, выбирайте людное
          место и предупредите кого-то из близких. Денег на этой доске быть не
          должно — если их просят, пожалуйтесь.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {notice.isMine && (
        <div className="glass rounded-2xl border border-glass-brd p-6">
          <h2 className="mb-1 font-display text-lg font-semibold text-text-0">
            Ваше объявление
          </h2>
          <p className="mb-4 text-sm text-text-2">
            Видно: {NOTICE_AUDIENCE_LABELS[notice.audience]}
          </p>

          <div className="mb-5 border-b border-glass-brd pb-5">
            <h3 className="mb-2 text-sm font-medium text-text-1">Фотографии</h3>
            <NoticeImagesUpload
              noticeId={notice.id}
              images={notice.images}
              onChanged={refresh}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {notice.canRenew && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => renewNotice(notice.id))}
                className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
              >
                Продлить
              </button>
            )}
            {notice.status === "published" && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      setNoticeStatus(notice.id, { status: "resolved" }),
                    )
                  }
                  className="rounded-xl border border-emerald-400/40 px-4 py-2 text-sm text-emerald-400 disabled:opacity-50"
                >
                  Вопрос решён
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      setNoticeStatus(notice.id, {
                        status: "hidden_by_author",
                      }),
                    )
                  }
                  className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
                >
                  Скрыть
                </button>
              </>
            )}
            {(notice.status === "hidden_by_author" ||
              notice.status === "resolved") && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(() => setNoticeStatus(notice.id, { status: "published" }))
                }
                className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
              >
                Опубликовать снова
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await deleteNotice(notice.id);
                  router.push("/notices/my");
                })
              }
              className="ml-auto rounded-xl border border-red-400/30 px-4 py-2 text-sm text-red-400 disabled:opacity-50"
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
