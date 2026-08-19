"use client";

import { useState } from "react";
import type {
  MotivationAdminCandidateDto,
  MotivationCategoryDto,
  MotivationVisualStyle,
} from "@vedamatch/shared";
import { CollapsibleBlock } from "../collapsible-block";
import { CategorySelect } from "./category-select";
import { DeletePostButton } from "./delete-post-button";
import { PipelineStages } from "./pipeline-stages";
import { QuoteDetails } from "./quote-details";
import { ActionBar, RejectControl, StyleSelect } from "./review-actions";
import { splitQuoteAndExplanation } from "../quote-text";
import type { RunCommand } from "./use-admin-command";
import { badgeClass, cardClass, primaryButton } from "./ui";

const aiActionLabel: Record<string, string> = {
  ai_suggest: "подсказка",
  ai_escalate: "эскалация",
  ai_approve: "одобрил",
  ai_reject: "отклонил",
  ai_error: "сбой модели",
  ai_publish: "опубликовал",
};

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
  // До одобрения текста стиля ещё нет — и подставлять сюда какой-нибудь вместо
  // пустого нельзя: он уедет на бэкенд как ручной выбор и отменит подбор по
  // источнику цитаты.
  const [style, setStyle] = useState<MotivationVisualStyle | null>(
    post.visualStyle,
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

      <PipelineStages status={post.reviewStatus} className="mt-4" />

      {post.origin === "user" && (
        <div className="mt-4 rounded-2xl border border-gold/40 bg-gold/5 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-gold/50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gold">
              Рилс участника
            </span>
            <span className="text-text-1">{post.authorName ?? "автор удалён"}</span>
            {!post.sourceVerified && (
              <span className="text-xs text-text-2">· своя цитата, без проверенного источника</span>
            )}
          </div>
          {post.aiVerdict && (
            <div className="mt-2 rounded-xl bg-bg-0/60 p-2 text-xs text-text-1">
              <span className="font-mono font-semibold text-text-0">
                ИИ · {aiActionLabel[post.aiVerdict.action]}
                {post.aiVerdict.decision ? ` · ${post.aiVerdict.decision}` : ""}
                {post.aiVerdict.confidence !== null ? ` · ${post.aiVerdict.confidence.toFixed(2)}` : ""}
              </span>
              {post.aiVerdict.flags.length > 0 && (
                <span className="ml-2 text-text-2">флаги: {post.aiVerdict.flags.join(", ")}</span>
              )}
              {post.aiVerdict.reason && <p className="mt-1 text-text-1">{post.aiVerdict.reason}</p>}
            </div>
          )}
          {post.appeal && (
            <div className="mt-2 rounded-xl border border-magenta/40 bg-magenta/5 p-2 text-xs">
              <span className="font-semibold text-magenta">Обращение автора</span>
              <p className="mt-1 text-text-1">{post.appeal.message}</p>
            </div>
          )}
        </div>
      )}

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
                body: style ? { visualStyle: style } : {},
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

      <div className="mt-4 border-t border-glass-brd pt-4">
        <DeletePostButton
          postId={post.id}
          title={post.title || post.slug}
          isPublished={post.status === "published"}
          pendingAction={pendingAction}
          run={run}
        />
      </div>
    </article>
  );
}
