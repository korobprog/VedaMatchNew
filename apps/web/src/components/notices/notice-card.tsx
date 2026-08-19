"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { BadgeCheck, CalendarDays, MapPin, Monitor } from "lucide-react";
import type { NoticeDto } from "@vedamatch/shared";
import { localizedName } from "@/lib/localized-name";
import {
  NOTICE_KIND_CHIPS,
  NOTICE_STATUS_LABELS,
  formatEventTime,
  noticeDescription,
  noticeTitle,
} from "./notice-labels";

const KIND_CHIP_STYLE: Record<string, string> = {
  offer: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  request: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  event: "border-indigo-400/40 bg-indigo-400/10 text-indigo-300",
  info: "border-glass-brd bg-glass text-text-1",
};

export function NoticeCard({ notice }: { notice: NoticeDto }) {
  const locale = useLocale();
  const description = noticeDescription(notice);
  const live = notice.status === "published";

  return (
    <Link
      href={`/notices/${notice.id}`}
      className="glass flex h-full flex-col rounded-2xl border border-glass-brd p-4 transition hover:border-magenta/30"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${KIND_CHIP_STYLE[notice.kind]}`}
        >
          {NOTICE_KIND_CHIPS[notice.kind]}
        </span>
        <span className="text-xs text-text-2">
          {localizedName(notice.rubric, locale)}
        </span>
        {/* Статус показываем только когда он не «опубликовано»: в общей ленте
            все записи живые, и подпись была бы шумом. */}
        {!live && (
          <span className="ml-auto text-xs text-text-2">
            {NOTICE_STATUS_LABELS[notice.status]}
          </span>
        )}
      </div>

      {notice.primaryImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={notice.primaryImageUrl}
          alt=""
          className="mb-3 h-40 w-full rounded-xl object-cover"
          loading="lazy"
        />
      )}

      <h2 className="font-medium text-text-0">{noticeTitle(notice)}</h2>
      {description && (
        <p className="mt-1 line-clamp-2 text-sm text-text-1">{description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-2">
        {notice.startsAt && (
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {formatEventTime(notice.startsAt, notice.timeZone)}
          </span>
        )}
        {notice.isOnline ? (
          <span className="flex items-center gap-1">
            <Monitor className="size-3.5" />
            Онлайн
          </span>
        ) : (
          notice.city && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {notice.city}
            </span>
          )
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-glass-brd pt-3 text-xs text-text-2">
        {notice.postedAs ? (
          <span className="flex items-center gap-1 truncate">
            {notice.postedAs.isVerified && (
              <BadgeCheck className="size-3.5 shrink-0 text-emerald-400" />
            )}
            {notice.postedAs.name}
          </span>
        ) : (
          <span className="truncate">{notice.author.name}</span>
        )}
      </div>
    </Link>
  );
}
