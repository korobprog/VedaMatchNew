"use client";

import type {
  MotivationAdminCandidateDto,
  MotivationProfileType,
} from "@vedamatch/shared";
import { CollapsibleBlock } from "../collapsible-block";
import { badgeClass } from "./ui";

const profileLabels: Record<MotivationProfileType, string> = {
  user: "Ищущий",
  yogi: "Йог",
  in_goodness: "В благости",
  devotee: "Преданный",
};

/** Атрибуция без пустых частей: при ручном вводе работа и локатор необязательны. */
export function formatAttribution(
  parts: Array<string | null | undefined>,
): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function QuoteDetails({ post }: { post: MotivationAdminCandidateDto }) {
  const quote = post.quote;
  const translation =
    quote?.translations.find((item) => item.language === "ru") ??
    quote?.translations[0];
  const sourceUrl = quote?.sourceUrl ?? post.attributionSourceUrl;

  if (!quote) {
    return (
      <p className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm text-text-0">
        Данные точной цитаты недоступны. Не одобряйте публикацию без проверки источника.
      </p>
    );
  }

  const attribution = formatAttribution([quote.author, quote.work, quote.locator]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gold">
          Оригинал · {quote.originalLanguage}
        </p>
        <blockquote className="mt-2 border-l-2 border-gold pl-4 text-base leading-7 text-text-0">
          {quote.originalText}
        </blockquote>
      </div>

      {translation && translation.quoteText !== quote.originalText && (
        <div className="rounded-xl bg-glass p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-2">
              Перевод · {translation.language}
            </p>
            {translation.label && (
              <span className={badgeClass}>{translation.label}</span>
            )}
          </div>
          <p className="mt-2 leading-7 text-text-1">{translation.quoteText}</p>
        </div>
      )}

      {attribution && (
        <p className="text-sm text-text-1">
          <span className="font-medium text-text-0">Атрибуция: </span>
          {attribution}
        </p>
      )}

      {quote.contextExcerpt.trim() && (
        <CollapsibleBlock
          title="Контекст"
          preview={quote.contextExcerpt.slice(0, 80)}
        >
          <p className="text-sm leading-6 text-text-1">{quote.contextExcerpt}</p>
        </CollapsibleBlock>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {post.profileTypes.map((profile) => (
          <span key={profile} className={badgeClass}>
            {profileLabels[profile]}
          </span>
        ))}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-sm font-medium text-cyan underline underline-offset-4"
          >
            Открыть источник
          </a>
        )}
      </div>
    </div>
  );
}
