"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type {
  MotivationAdminCandidateDto,
  MotivationCategoryDto,
} from "@vedamatch/shared";
import { ArchiveList } from "./archive-list";
import { ImageReviewCard } from "./image-review-card";
import { LoadFailure } from "./load-failure";
import { QuoteReviewCard } from "./quote-review-card";
import {
  selectImagePosts,
  selectSetAsidePosts,
  selectTextPosts,
} from "./queue-selectors";
import { useAdminCommand } from "./use-admin-command";
import { cardClass, primaryButton } from "./ui";

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-xl border border-glass-brd px-3 py-2.5">
      <p className="text-2xl font-bold text-text-0">{value}</p>
      <p className="text-xs text-text-2">{label}</p>
    </div>
  );
}

export function QueueBoard({
  posts,
  categories,
}: {
  posts: MotivationAdminCandidateDto[] | null;
  categories: MotivationCategoryDto[];
}) {
  const router = useRouter();
  const { pending, errors, run } = useAdminCommand();

  useEffect(() => {
    if (
      !posts?.some(
        (post) => post.reviewStatus === "image_queued" || post.status === "generating",
      )
    )
      return;
    const timer = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [posts, router]);

  if (!posts) return <LoadFailure what="публикации Motivation" />;

  const textPosts = selectTextPosts(posts);
  const imagePosts = selectImagePosts(posts);
  const setAsidePosts = selectSetAsidePosts(posts);
  const failedCount = posts.filter((post) => post.reviewStatus === "failed").length;

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        <StatTile label="ждут текста" value={textPosts.length} />
        <StatTile label="ждут картинки" value={imagePosts.length} />
        <StatTile label="с ошибкой" value={failedCount} />
      </div>

      <div className="mt-4">
        <button
          type="button"
          disabled={pending.daily !== undefined}
          onClick={() =>
            run("daily", "generate", { path: "/admin/motivation/generate", body: {} })
          }
          className={primaryButton}
        >
          {pending.daily ? "Запускаем…" : "Подготовить цитаты на сегодня"}
        </button>
        {errors.daily && (
          <p role="alert" className="mt-2 text-sm font-medium text-red-500">
            {errors.daily}
          </p>
        )}
      </div>

      <section aria-labelledby="text-review-heading" className="mt-8">
        <h2 id="text-review-heading" className="text-xl font-semibold text-text-0">
          Цитаты и текст
        </h2>
        <p className="mt-1 text-sm text-text-2">
          Проверьте точность цитаты, источник и атрибуцию до запуска изображения.
        </p>
        <div className="mt-4 space-y-4">
          {textPosts.length === 0 ? (
            <p className={`${cardClass} text-center text-text-2`}>
              Нет цитат, ожидающих проверки текста.
            </p>
          ) : (
            textPosts.map((post) => (
              <QuoteReviewCard
                key={post.id}
                post={post}
                categories={categories}
                pendingAction={pending[post.id]}
                error={errors[post.id]}
                run={run}
              />
            ))
          )}
        </div>
      </section>

      <section aria-labelledby="image-review-heading" className="mt-10">
        <h2 id="image-review-heading" className="text-xl font-semibold text-text-0">
          Изображения
        </h2>
        <p className="mt-1 text-sm text-text-2">
          Изображение появляется здесь после одобрения текста и публикуется отдельным действием.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {imagePosts.length === 0 ? (
            <p className={`${cardClass} text-center text-text-2 lg:col-span-2`}>
              Нет изображений, ожидающих проверки.
            </p>
          ) : (
            imagePosts.map((post) => (
              <ImageReviewCard
                key={post.id}
                post={post}
                pendingAction={pending[post.id]}
                error={errors[post.id]}
                run={run}
              />
            ))
          )}
        </div>
      </section>

      {/* Опубликованное здесь больше не лежит — у него своя вкладка. Тут
          остаётся только отложенное: отклонённое и снятое с показа. */}
      <ArchiveList posts={setAsidePosts} pending={pending} errors={errors} run={run} />
    </>
  );
}
