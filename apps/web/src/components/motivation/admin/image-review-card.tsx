"use client";

import { useState } from "react";
import {
  DEFAULT_MOTIVATION_VIDEO_PROMPT,
  MOTIVATION_VOICES,
  type MotivationAdminCandidateDto,
  type MotivationVisualStyle,
} from "@vedamatch/shared";
import { CollapsibleBlock } from "../collapsible-block";
import { DeletePostButton } from "./delete-post-button";
import { PipelineStages } from "./pipeline-stages";
import { PromptEditor } from "./prompt-editor";
import { QuoteDetails } from "./quote-details";
import { VoicePreviewButton } from "./voice-preview-button";
import { ActionBar, RejectControl, StyleSelect } from "./review-actions";
import type { RunCommand } from "./use-admin-command";
import { badgeClass, fieldClass, primaryButton, secondaryButton } from "./ui";

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
  // Селект показывает стиль, которым картинка уже сделана. Пустое значение —
  // «оставить как решила система»: перегенерация тогда идёт с тем же стилем,
  // а не с подставленным по умолчанию.
  const [style, setStyle] = useState<MotivationVisualStyle | null>(
    post.visualStyle,
  );
  // Сторис — отдельный файл с подписью. Без переключателя её нельзя было
  // проверить перед публикацией: карточка показывала только чистую картинку.
  const [view, setView] = useState<"image" | "story" | "video">("image");
  const disabled = pendingAction !== undefined;
  const canReview = post.reviewStatus === "image_review";
  const hasSeparateStory =
    Boolean(post.storyImageUrl) && post.storyImageUrl !== post.imageUrl;
  const shown = view === "story" ? post.storyImageUrl : post.imageUrl;
  const hasVideo = Boolean(post.videoUrl);
  const videoBusy =
    post.videoStatus === "queued" || post.videoStatus === "running";

  return (
    <article className="glass overflow-hidden rounded-2xl border border-glass-brd">
      {view === "video" ? (
        hasVideo ? (
          // Постер обязателен: пока ролик грузится, зритель должен видеть кадр,
          // а не пустой прямоугольник.
          <video
            src={post.videoUrl ?? undefined}
            poster={post.storyImageUrl ?? post.imageUrl ?? undefined}
            controls
            loop
            playsInline
            className="aspect-[9/16] w-full bg-bg-1 object-cover"
          />
        ) : (
          <div className="flex aspect-[9/16] items-center justify-center bg-bg-1 px-6 text-center text-sm text-text-2">
            {videoBusy
              ? "Ролик создаётся, это занимает около минуты…"
              : post.videoErrorCode
                ? `Не получилось: ${post.videoErrorCode}`
                : "Ролик ещё не заказан"}
          </div>
        )
      ) : shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shown}
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

      {post.imageUrl && (
        <div className="flex items-center gap-2 border-b border-glass-brd px-4 py-2">
          {(["image", "story", "video"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                view === key
                  ? "bg-cyan/10 text-cyan"
                  : "text-text-2 hover:text-text-0",
              ].join(" ")}
            >
              {key === "image"
                ? "Иллюстрация"
                : key === "story"
                  ? "Сторис с подписью"
                  : "Видео"}
            </button>
          ))}
          {!hasSeparateStory && (
            <span className="ml-auto text-xs text-text-2">
              Сторис без подписи — пост создан до её появления
            </span>
          )}
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

        <PipelineStages status={post.reviewStatus} className="mt-4" />

        <div className="mt-4">
          <QuoteDetails post={post} />
        </div>

        <div className="mt-4">
          <CollapsibleBlock
            title="Промпт изображения"
            preview={post.imagePrompt?.slice(0, 60) ?? "не сформирован"}
            tone="framed"
          >
            <PromptEditor
              postId={post.id}
              postTitle={post.title || post.slug}
              field="imagePrompt"
              value={post.imagePrompt}
              placeholder="Промпт пока не сформирован"
              hint={
                post.imagePromptEdited
                  ? "Промпт правили руками — перегенерация возьмёт этот текст. Смена стиля соберёт черновик заново."
                  : "Черновик собран автоматически. Правки уйдут в генерацию как есть."
              }
              disabled={disabled}
              pendingAction={pendingAction}
              run={run}
            />
          </CollapsibleBlock>
        </div>

        <div className="mt-4">
          <CollapsibleBlock
            title="Промпт видео"
            preview={post.videoPrompt?.slice(0, 60) ?? "мягкое естественное движение"}
            tone="framed"
          >
            <PromptEditor
              postId={post.id}
              postTitle={post.title || post.slug}
              field="videoPrompt"
              value={post.videoPrompt}
              placeholder={DEFAULT_MOTIVATION_VIDEO_PROMPT}
              hint="Здесь описывается движение, а не сцена: что колышется, куда плывёт свет, как ведёт себя камера. Описание кадра видеомодель понимает как «повтори то же самое» и отдаёт застывший ролик. Пустое поле — общий дефолт про мягкое естественное движение."
              disabled={disabled}
              pendingAction={pendingAction}
              run={run}
            />
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
              {/* Чтение цитаты голосом — решение редакции, а не побочный
                  эффект генерации, поэтому переключатель отдельный и рядом. */}
              <label className="flex items-center gap-2 text-sm text-text-1">
                <input
                  type="checkbox"
                  checked={post.videoVoice}
                  disabled={disabled || videoBusy}
                  onChange={(event) =>
                    run(post.id, "voice", {
                      path: `/admin/motivation/posts/${post.id}/voice`,
                      body: { enabled: event.target.checked },
                    })
                  }
                />
                Читать цитату голосом
              </label>
              {post.videoVoice && (
                <label className="grid gap-1 text-sm text-text-1">
                  <span>Голос</span>
                  <select
                    value={post.videoVoiceName ?? ""}
                    disabled={disabled || videoBusy}
                    onChange={(event) =>
                      run(post.id, "voice", {
                        path: `/admin/motivation/posts/${post.id}/voice`,
                        body: { voice: event.target.value || null },
                      })
                    }
                    className={fieldClass}
                  >
                    <option value="">По умолчанию</option>
                    {MOTIVATION_VOICES.map((voice) => (
                      <option key={voice} value={voice}>
                        {voice}
                      </option>
                    ))}
                  </select>
                  <VoicePreviewButton voice={post.videoVoiceName} />
                </label>
              )}
              {/* Оживление стоит денег за каждый заход, поэтому это отдельное
                  осознанное действие, а не часть публикации. */}
              <button
                type="button"
                disabled={disabled || videoBusy}
                onClick={() =>
                  run(post.id, "animate", {
                    path: `/admin/motivation/posts/${post.id}/animate`,
                  })
                }
                className={secondaryButton}
                title="Создать короткий ролик из этой иллюстрации"
              >
                {pendingAction === "animate"
                  ? "Ставим в очередь…"
                  : videoBusy
                    ? "Ролик создаётся…"
                    : hasVideo
                      ? "Переснять ролик"
                      : "Оживить"}
              </button>
              {/* Собранный ролик виден только здесь, пока его не приняли.
                  Эндпоинт приёмки был, а вызвать его из интерфейса было
                  нечем — ролики копились в очереди, а автор ждал впустую. */}
              {post.videoStatus === "review" && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    run(post.id, "approve-video", {
                      path: `/admin/motivation/posts/${post.id}/approve-video`,
                    })
                  }
                  className={primaryButton}
                  title="Показать ролик автору"
                >
                  {pendingAction === "approve-video"
                    ? "Принимаем…"
                    : "Принять ролик"}
                </button>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  run(post.id, "regenerate-image", {
                    path: `/admin/motivation/posts/${post.id}/regenerate-image`,
                    body: style ? { visualStyle: style } : {},
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

        <div className="mt-4 border-t border-glass-brd pt-4">
          <DeletePostButton
            postId={post.id}
            title={post.title || post.slug}
            isPublished={post.status === "published"}
            pendingAction={pendingAction}
            run={run}
          />
        </div>
      </div>
    </article>
  );
}
