"use client";

import Link from "next/link";
import { BadgeCheck, Globe, MapPin, MessageSquare } from "lucide-react";
import type { VacancyOfferDto } from "@vedamatch/shared";
import {
  VACANCY_KIND_CHIPS,
  VACANCY_KIND_CHIP_STYLE,
  VACANCY_STATUS_LABELS,
  formatExpiry,
  offerTerms,
} from "./vacancy-labels";

export function VacancyCard({ offer }: { offer: VacancyOfferDto }) {
  const live = offer.status === "published";
  const terms = offerTerms(offer);

  return (
    <Link
      href={`/vacancies/${offer.id}`}
      className="glass flex h-full flex-col rounded-2xl border border-glass-brd p-4 transition hover:border-magenta/30"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${VACANCY_KIND_CHIP_STYLE[offer.kind]}`}
        >
          {VACANCY_KIND_CHIPS[offer.kind]}
        </span>
        {/* Статус только когда он не «опубликовано»: в общей ленте все
            записи живые, и подпись была бы шумом. */}
        {!live && (
          <span className="ml-auto text-xs text-text-2">
            {VACANCY_STATUS_LABELS[offer.status]}
          </span>
        )}
      </div>

      <h2 className="font-medium text-text-0">{offer.title}</h2>
      {terms && <p className="mt-1 text-sm text-text-1">{terms}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-2">
        {offer.isRemote ? (
          <span className="flex items-center gap-1">
            <Globe className="size-3.5" aria-hidden />
            {offer.city ? `Удалённо · ${offer.city}` : "Удалённо"}
          </span>
        ) : (
          offer.city && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {offer.city}
            </span>
          )
        )}
        {live && <span>{formatExpiry(offer.expiresAt)}</span>}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-glass-brd pt-3 text-xs text-text-2">
        {offer.postedAs ? (
          <span className="flex items-center gap-1 truncate">
            {offer.postedAs.isVerified && (
              <BadgeCheck className="size-3.5 shrink-0 text-emerald-400" aria-hidden />
            )}
            {offer.postedAs.name}
          </span>
        ) : (
          <span className="truncate">{offer.author.name}</span>
        )}
        {offer.responsesCount > 0 && (
          <span className="ml-auto flex items-center gap-1">
            <MessageSquare className="size-3.5" aria-hidden />
            {offer.responsesCount}
          </span>
        )}
      </div>
    </Link>
  );
}
