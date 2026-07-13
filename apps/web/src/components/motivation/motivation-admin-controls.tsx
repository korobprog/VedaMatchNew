"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  MotivationAdminCandidateDto,
  MotivationApproveTextInput,
  MotivationProfileType,
  MotivationRegenerateImageInput,
  MotivationRejectInput,
  MotivationVisualStyle,
} from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const visualStyles: ReadonlyArray<{ value: MotivationVisualStyle; label: string }> = [
  { value: "spiritual_watercolor", label: "Духовная акварель" },
  { value: "cinematic_nature", label: "Кинематографичная природа" },
  { value: "indian_miniature", label: "Индийская миниатюра" },
  { value: "sacred_architecture", label: "Сакральная архитектура" },
  { value: "minimal_symbolism", label: "Минималистичный символизм" },
  { value: "warm_documentary", label: "Тёплая документалистика" },
  { value: "cosmic_contemplation", label: "Космическое созерцание" },
  { value: "historical_editorial", label: "Историческая редакционная иллюстрация" },
];

const profileLabels: Record<MotivationProfileType, string> = {
  user: "Ищущий",
  yogi: "Йог",
  in_goodness: "В благости",
  devotee: "Преданный",
};

type AdminCommand =
  | { path: `/admin/motivation/posts/${string}/approve-text`; body: MotivationApproveTextInput }
  | { path: `/admin/motivation/posts/${string}/approve-image`; body?: never }
  | { path: `/admin/motivation/posts/${string}/reject`; body: MotivationRejectInput }
  | { path: `/admin/motivation/posts/${string}/regenerate-image`; body: MotivationRegenerateImageInput }
  | { path: "/admin/motivation/generate"; body: { date?: string } };

type RunCommand = (postId: string, action: string, command: AdminCommand) => Promise<void>;

function StyleSelect({
  post,
  value,
  disabled,
  onChange,
}: {
  post: MotivationAdminCandidateDto;
  value: MotivationVisualStyle;
  disabled: boolean;
  onChange: (style: MotivationVisualStyle) => void;
}) {
  const label = `Стиль изображения для «${post.title || post.slug}»`;
  return (
    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as MotivationVisualStyle)}
        className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      >
        {visualStyles.map((style) => (
          <option key={style.value} value={style.value}>{style.label}</option>
        ))}
      </select>
    </label>
  );
}

function QuoteDetails({ post }: { post: MotivationAdminCandidateDto }) {
  const quote = post.quote;
  const translation = quote?.translations.find((item) => item.language === "ru") ?? quote?.translations[0];
  const sourceUrl = quote?.sourceUrl ?? post.attributionSourceUrl;

  if (!quote) {
    return (
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        Данные точной цитаты недоступны. Не одобряйте публикацию без проверки источника.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Оригинал · {quote.originalLanguage}</p>
        <blockquote className="mt-2 border-l-2 border-amber-400 pl-4 text-base leading-7 text-zinc-900 dark:text-zinc-100">
          {quote.originalText}
        </blockquote>
      </div>

      {translation && (
        <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Перевод · {translation.language}</p>
            {translation.label && (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                {translation.label}
              </span>
            )}
          </div>
          <p className="mt-2 leading-7 text-zinc-800 dark:text-zinc-200">{translation.quoteText}</p>
        </div>
      )}

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Атрибуция</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">{quote.author} · {quote.work} · {quote.locator}</p>
        </div>
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Контекст</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">{quote.contextExcerpt}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {post.profileTypes.map((profile) => (
          <span key={profile} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            {profileLabels[profile]}
          </span>
        ))}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-sm font-medium text-amber-700 underline underline-offset-4 dark:text-amber-400"
          >
            Открыть источник
          </a>
        )}
      </div>
    </div>
  );
}

function RejectControl({
  post,
  disabled,
  pendingAction,
  onReject,
}: {
  post: MotivationAdminCandidateDto;
  disabled: boolean;
  pendingAction: string | undefined;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const label = `Причина отклонения для «${post.title || post.slug}»`;

  return (
    <div className="space-y-2 sm:col-span-2">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <span>{label}</span>
        <textarea
          aria-label={label}
          value={reason}
          disabled={disabled}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Укажите, что необходимо исправить"
          rows={2}
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>
      <button
        type="button"
        disabled={disabled || !reason.trim()}
        onClick={() => onReject(reason.trim())}
        className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300"
      >
        {pendingAction === "reject" ? "Отклонение…" : "Отклонить"}
      </button>
    </div>
  );
}

function QuoteReviewCard({
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
  const [style, setStyle] = useState<MotivationVisualStyle>(post.visualStyle ?? "spiritual_watercolor");
  const disabled = pendingAction !== undefined;
  const canReview = post.reviewStatus === "text_review";

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">{post.contentDate} · {post.category}</p>
          <h3 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">{post.title || post.slug}</h3>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          {canReview ? "Ожидает проверки текста" : post.reviewStatus}
        </span>
      </div>

      <div className="mt-5"><QuoteDetails post={post} /></div>

      <div className="mt-5 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Пояснение VedaMatch</p>
        <p className="mt-2 whitespace-pre-line leading-7 text-zinc-700 dark:text-zinc-300">{post.text}</p>
      </div>

      {post.generationErrorCode && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          Ошибка: {post.generationErrorCode}
        </p>
      )}
      {error && <p role="alert" className="mt-4 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}

      {canReview && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <StyleSelect post={post} value={style} disabled={disabled} onChange={setStyle} />
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => run(post.id, "approve-text", { path: `/admin/motivation/posts/${post.id}/approve-text`, body: { visualStyle: style } })}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pendingAction === "approve-text" ? "Одобрение…" : "Одобрить текст"}
            </button>
          </div>
          <RejectControl
            post={post}
            disabled={disabled}
            pendingAction={pendingAction}
            onReject={(reason) => run(post.id, "reject", { path: `/admin/motivation/posts/${post.id}/reject`, body: { reason } })}
          />
        </div>
      )}
    </article>
  );
}

function ImageReviewCard({
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
  const [style, setStyle] = useState<MotivationVisualStyle>(post.visualStyle ?? "spiritual_watercolor");
  const disabled = pendingAction !== undefined;
  const canReview = post.reviewStatus === "image_review";

  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {post.imageUrl ? (
        <img src={post.imageUrl} alt={post.title || post.slug} className="aspect-[9/16] w-full object-cover" />
      ) : (
        <div className="flex aspect-[9/16] items-center justify-center bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-950">
          {post.reviewStatus === "image_queued" ? "Изображение создаётся…" : "Изображение недоступно"}
        </div>
      )}

      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">{post.contentDate} · {post.category}</p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">{post.title || post.slug}</h3>
          </div>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-900 dark:bg-violet-900/40 dark:text-violet-200">
            {canReview ? "Ожидает проверки изображения" : "Генерация изображения"}
          </span>
        </div>

        <div className="mt-5"><QuoteDetails post={post} /></div>

        <div className="mt-5 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Промпт изображения</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-600 dark:text-zinc-400">{post.imagePrompt || "Промпт пока не сформирован."}</p>
        </div>

        {post.generationErrorCode && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            Ошибка: {post.generationErrorCode}
          </p>
        )}
        {error && <p role="alert" className="mt-4 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}

        {canReview && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <StyleSelect post={post} value={style} disabled={disabled} onChange={setStyle} />
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => run(post.id, "approve-image", { path: `/admin/motivation/posts/${post.id}/approve-image` })}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pendingAction === "approve-image" ? "Публикация…" : "Опубликовать"}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => run(post.id, "regenerate-image", { path: `/admin/motivation/posts/${post.id}/regenerate-image`, body: { visualStyle: style } })}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {pendingAction === "regenerate-image" ? "Перегенерация…" : "Перегенерировать"}
              </button>
            </div>
            <RejectControl
              post={post}
              disabled={disabled}
              pendingAction={pendingAction}
              onReject={(reason) => run(post.id, "reject", { path: `/admin/motivation/posts/${post.id}/reject`, body: { reason } })}
            />
          </div>
        )}
      </div>
    </article>
  );
}

export function MotivationAdminControls({ posts }: { posts: MotivationAdminCandidateDto[] | null }) {
  const router = useRouter();
  const [pendingByPost, setPendingByPost] = useState<Record<string, string>>({});
  const [errorsByPost, setErrorsByPost] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!posts?.some((post) => post.reviewStatus === "image_queued" || post.status === "generating")) return;
    const timer = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [posts, router]);

  async function run(postId: string, action: string, command: AdminCommand) {
    setPendingByPost((current) => ({ ...current, [postId]: action }));
    setErrorsByPost((current) => {
      const next = { ...current };
      delete next[postId];
      return next;
    });

    try {
      const response = await fetch(`${API_URL}${command.path}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: command.body === undefined ? undefined : JSON.stringify(command.body),
      });
      if (!response.ok) throw new Error((await response.text()) || `Ошибка API ${response.status}`);
      router.refresh();
    } catch (requestError) {
      setErrorsByPost((current) => ({
        ...current,
        [postId]: requestError instanceof Error ? requestError.message : "Не удалось выполнить действие",
      }));
    } finally {
      setPendingByPost((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
    }
  }

  if (!posts) {
    return <p className="mt-6 rounded-xl bg-red-50 p-4 text-red-800 dark:bg-red-950/40 dark:text-red-200">Не удалось загрузить публикации Motivation.</p>;
  }

  const textPosts = posts.filter((post) =>
    ["discovered", "source_verified", "text_review"].includes(post.reviewStatus)
    || (post.reviewStatus === "failed" && !post.textApprovedAt),
  );
  const imagePosts = posts.filter((post) =>
    ["image_queued", "image_review"].includes(post.reviewStatus)
    || (post.reviewStatus === "failed" && Boolean(post.textApprovedAt)),
  );

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pendingByPost.daily !== undefined}
          onClick={() => run("daily", "generate", { path: "/admin/motivation/generate", body: {} })}
          className="rounded-xl bg-amber-600 px-5 py-3 font-medium text-white disabled:opacity-50"
        >
          {pendingByPost.daily ? "Запускаем…" : "Подготовить цитаты на сегодня"}
        </button>
        {errorsByPost.daily && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">{errorsByPost.daily}</p>}
      </div>

      <section aria-labelledby="text-review-heading" className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="text-review-heading" className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Цитаты и текст</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Проверьте точность цитаты, источник, атрибуцию и пояснение до запуска изображения.</p>
          </div>
          <span className="rounded-full bg-zinc-200 px-3 py-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{textPosts.length}</span>
        </div>
        <div className="mt-4 space-y-4">
          {textPosts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-zinc-500 dark:border-zinc-700">Нет цитат, ожидающих проверки текста.</p>
          ) : textPosts.map((post) => (
            <QuoteReviewCard
              key={post.id}
              post={post}
              pendingAction={pendingByPost[post.id]}
              error={errorsByPost[post.id]}
              run={run}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="image-review-heading" className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="image-review-heading" className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Изображения</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Изображение появляется здесь только после одобрения текста и публикуется отдельным действием.</p>
          </div>
          <span className="rounded-full bg-zinc-200 px-3 py-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{imagePosts.length}</span>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {imagePosts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-zinc-500 dark:border-zinc-700 lg:col-span-2">Нет изображений, ожидающих проверки.</p>
          ) : imagePosts.map((post) => (
            <ImageReviewCard
              key={post.id}
              post={post}
              pendingAction={pendingByPost[post.id]}
              error={errorsByPost[post.id]}
              run={run}
            />
          ))}
        </div>
      </section>
    </>
  );
}
