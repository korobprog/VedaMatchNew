"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  MotivationAdminCandidateDto,
  MotivationCategoryDto,
} from "@vedamatch/shared";
import { ArchiveList } from "./archive-list";
import { ImageReviewCard } from "./image-review-card";
import { LoadFailure } from "./load-failure";
import { QuoteReviewCard } from "./quote-review-card";
import { ScrollNavButtons } from "@/components/ui/scroll-nav-buttons";
import {
  filterByQuery,
  selectImagePosts,
  selectSetAsidePosts,
  selectTextPosts,
} from "./queue-selectors";
import { useAdminCommand } from "./use-admin-command";
import { cardClass, fieldClass, labelClass, primaryButton } from "./ui";

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
  /**
   * Поиск по очереди (VED-200): одно поле на всю вкладку, а не по одному на
   * раздел — редактор ищет афоризм, а не «раздел, где он застрял». Тот же
   * приём, что уже работает на «Опубликованных» (`published-list.tsx`):
   * локальное состояние + `useMemo`, без похода на сервер — вся очередь и
   * так приходит одним запросом.
   */
  const [query, setQuery] = useState("");

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

  // Селекторы и фильтр — до раннего `return` по `!posts`: иначе число
  // вызовов хуков менялось бы между рендерами (пока загрузка не удалась —
  // `useMemo` ниже не выполнялся бы вовсе), что React не разрешает.
  const textPosts = useMemo(() => (posts ? selectTextPosts(posts) : []), [posts]);
  const imagePosts = useMemo(() => (posts ? selectImagePosts(posts) : []), [posts]);
  const setAsidePosts = useMemo(
    () => (posts ? selectSetAsidePosts(posts) : []),
    [posts],
  );
  // Фильтр накладывается поверх каждой выборки раздельно: карточка,
  // подходящая под запрос, остаётся в своём разделе — поиск не путает
  // «ждёт текста» с «ждёт картинки».
  const foundTextPosts = useMemo(
    () => filterByQuery(textPosts, query),
    [textPosts, query],
  );
  const foundImagePosts = useMemo(
    () => filterByQuery(imagePosts, query),
    [imagePosts, query],
  );
  const searching = query.trim().length > 0;

  if (!posts) return <LoadFailure what="публикации Motivation" />;

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

      {/* Один поиск на всю вкладку (VED-200), не по одному на раздел:
          редактор ищет афоризм, а не «раздел, где он застрял». Тот же приём,
          что и на «Опубликованных» — та же подпись, тот же плейсхолдер, тот
          же способ фильтрации по цитате и автору. */}
      <label className="mt-6 block max-w-md">
        <span className={labelClass}>Найти по цитате или автору</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Например: Прабхупада"
          className={`${fieldClass} mt-1`}
        />
      </label>

      <section aria-labelledby="text-review-heading" className="mt-8">
        <h2 id="text-review-heading" className="text-xl font-semibold text-text-0">
          Цитаты и текст
        </h2>
        <p className="mt-1 text-sm text-text-2">
          Проверьте точность цитаты, источник и атрибуцию до запуска изображения.
        </p>
        {/* Счётчик только когда в разделе вообще есть записи: пустой раздел
            и так объясняет себя строкой «Нет цитат…» ниже, а «Найдено: 0 из
            0» рядом с ней — лишний шум про то же самое. */}
        {searching && textPosts.length > 0 && (
          <p className="mt-1 text-sm text-text-2">
            Найдено: {foundTextPosts.length} из {textPosts.length}
          </p>
        )}
        <div className="mt-4 space-y-4">
          {textPosts.length === 0 ? (
            <p className={`${cardClass} text-center text-text-2`}>
              Нет цитат, ожидающих проверки текста.
            </p>
          ) : foundTextPosts.length === 0 ? (
            <p className={`${cardClass} text-center text-text-2`}>
              Ничего не нашлось. Попробуйте другое слово.
            </p>
          ) : (
            foundTextPosts.map((post) => (
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
        {searching && imagePosts.length > 0 && (
          <p className="mt-1 text-sm text-text-2">
            Найдено: {foundImagePosts.length} из {imagePosts.length}
          </p>
        )}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {imagePosts.length === 0 ? (
            <p className={`${cardClass} text-center text-text-2 lg:col-span-2`}>
              Нет изображений, ожидающих проверки.
            </p>
          ) : foundImagePosts.length === 0 ? (
            <p className={`${cardClass} text-center text-text-2 lg:col-span-2`}>
              Ничего не нашлось. Попробуйте другое слово.
            </p>
          ) : (
            foundImagePosts.map((post) => (
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

      {/* VED-265: та же плавающая прокрутка, что и на «Опубликованных» —
          «Заготовки» не короче (два раздела карточек плюс отложенное). */}
      <ScrollNavButtons />
    </>
  );
}
