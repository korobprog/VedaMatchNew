"use client";

import { useState } from "react";
import type {
  MotivationAdminCandidateDto,
  MotivationVisualStyle,
} from "@vedamatch/shared";
import { CollapsibleBlock } from "../collapsible-block";
import { QuoteDetails } from "./quote-details";
import { ActionBar, RejectControl, StyleSelect } from "./review-actions";
import type { RunCommand } from "./use-admin-command";
import { badgeClass, primaryButton, secondaryButton } from "./ui";

export function ImageReviewCard({
  post,
  pendingAction,
  error,
  run,
}: {
  post: MotivationAdminCandidateDto;
  pendingAction: string | undefined;
  error: string | undefined;
  run: RunCommand;
}) {
  const [style, setStyle] = useState<MotivationVisualStyle>(
    post.visualStyle ?? "spiritual_watercolor",
  );
  const disabled = pendingAction !== undefined;
  const canReview = post.reviewStatus === "image_review";

  return (
    <article className="glass overflow-hidden rounded-2xl border border-glass-brd">
      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt={post.title || post.slug}
          className="aspect-[9/16] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[9/16] items-center justify-center bg-bg-1 text-sm text-text-2">
          {post.reviewStatus === "image_queued"
            ? "Изображение создаётся…"
            : "Изображение недоступно"}
        </div>
      )}

      <div className="p-4 sm:p-5">
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
            {canReview ? "Ожидает проверки изображения" : "Генерация изображения"}
          </span>
        </div>

        <div className="mt-4">
          <QuoteDetails post={post} />
        </div>

        <div className="mt-4">
          <CollapsibleBlock
            title="Промпт изображения"
            preview={post.imagePrompt?.slice(0, 60) ?? "не сформирован"}
            tone="framed"
          >
            <p className="whitespace-pre-line text-sm leading-6 text-text-1">
              {post.imagePrompt || "Промпт пока не сформирован."}
            </p>
          </CollapsibleBlock>
        </div>

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
            <StyleSelect post={post} value={style} disabled={disabled} onChange={setStyle} />
            <div className="grid gap-2 sm:items-end">
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  run(post.id, "approve-image", {
                    path: `/admin/motivation/posts/${post.id}/approve-image`,
                  })
                }
                className={primaryButton}
              >
                {pendingAction === "approve-image" ? "Публикация…" : "Опубликовать"}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  run(post.id, "regenerate-image", {
                    path: `/admin/motivation/posts/${post.id}/regenerate-image`,
                    body: { visualStyle: style },
                  })
                }
                className={secondaryButton}
              >
                {pendingAction === "regenerate-image"
                  ? "Перегенерация…"
                  : "Перегенерировать"}
              </button>
            </div>
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
      </div>
    </article>
  );
}
