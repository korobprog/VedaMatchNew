"use client";

import { useState } from "react";
import type {
  MotivationAdminCandidateDto,
  MotivationCategoryDto,
  MotivationVisualStyle,
} from "@vedamatch/shared";
import { CollapsibleBlock } from "../collapsible-block";
import { CategorySelect } from "./category-select";
import { QuoteDetails } from "./quote-details";
import { ActionBar, RejectControl, StyleSelect } from "./review-actions";
import { splitQuoteAndExplanation } from "../quote-text";
import type { RunCommand } from "./use-admin-command";
import { badgeClass, cardClass, primaryButton } from "./ui";

export function QuoteReviewCard({
  post,
  categories,
  pendingAction,
  error,
  run,
}: {
  post: MotivationAdminCandidateDto;
  categories: MotivationCategoryDto[];
  pendingAction: string | undefined;
  error: string | undefined;
  run: RunCommand;
}) {
  const [style, setStyle] = useState<MotivationVisualStyle>(
    post.visualStyle ?? "spiritual_watercolor",
  );
  const [category, setCategory] = useState(post.category);
  const disabled = pendingAction !== undefined;
  const canReview = post.reviewStatus === "text_review";
  const { explanation } = splitQuoteAndExplanation(post.text);

  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">
            {post.contentDate}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-text-0 sm:text-xl">
            {post.title || post.slug}
          </h3>
        </div>
        <span className={badgeClass}>
          {canReview ? "Ожидает проверки текста" : post.reviewStatus}
        </span>
      </div>

      <div className="mt-4">
        <QuoteDetails post={post} />
      </div>

      {explanation && (
        <div className="mt-4">
          <CollapsibleBlock
            title="Пояснение VedaMatch"
            preview={explanation.slice(0, 80)}
            tone="framed"
          >
            <p className="whitespace-pre-line leading-7 text-text-1">{explanation}</p>
          </CollapsibleBlock>
        </div>
      )}

      {post.generationErrorCode && (
        <p className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-500">
          Ошибка: {post.generationErrorCode}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-500">
          {error}
        </p>
      )}

      {canReview && (
        <ActionBar>
          <CategorySelect
            categories={categories}
            value={category}
            disabled={disabled}
            onChange={(slug) => {
              setCategory(slug);
              void run(post.id, "category", {
                path: `/admin/motivation/posts/${post.id}`,
                method: "PATCH",
                body: { category: slug },
              });
            }}
          />
          <StyleSelect post={post} value={style} disabled={disabled} onChange={setStyle} />
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              run(post.id, "approve-text", {
                path: `/admin/motivation/posts/${post.id}/approve-text`,
                body: { visualStyle: style },
              })
            }
            className={`${primaryButton} sm:col-span-2`}
          >
            {pendingAction === "approve-text" ? "Одобрение…" : "Одобрить текст"}
          </button>
          <RejectControl
            post={post}
            disabled={disabled}
            pendingAction={pendingAction}
            onReject={(reason) =>
              run(post.id, "reject", {
                path: `/admin/motivation/posts/${post.id}/reject`,
                body: { reason },
              })
            }
          />
        </ActionBar>
      )}
    </article>
  );
}
