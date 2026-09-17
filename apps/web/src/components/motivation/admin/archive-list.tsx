"use client";

import { Eye } from "lucide-react";
import type { MotivationAdminCandidateDto } from "@vedamatch/shared";
import { CollapsibleBlock } from "../collapsible-block";
import { DeletePostButton } from "./delete-post-button";
import { stageHint } from "./pipeline-stages";
import type { RunCommand } from "./use-admin-command";
import { badgeClass, iconButton } from "./ui";

/**
 * Отложенное: по-настоящему отклонённое генерацией. Список компактный и
 * свёрнут по умолчанию — он нужен, чтобы такую мотивацию можно было найти и
 * удалить, а не чтобы её перечитывать.
 *
 * Опубликованного здесь нет: за ним приходят с другим вопросом, и у него
 * своя вкладка. Скрытого после публикации (`status: 'hidden'`) тоже нет —
 * с VED-251 его канонический дом переехал на вкладку «Опубликованные»
 * (`selectPublishedPosts`), там же и кнопка возврата. Обработка `hidden`
 * ниже остаётся защитным случаем: подпись и кнопка возврата верны и для
 * него, если он сюда всё же попадёт, — компонент не должен молча врать
 * «Опубликовано и видно в ленте» скрытой карточке, как было раньше.
 */
export function ArchiveList({
  posts,
  pending,
  errors,
  run,
}: {
  posts: MotivationAdminCandidateDto[];
  pending: Record<string, string>;
  errors: Record<string, string>;
  run: RunCommand;
}) {
  if (posts.length === 0) return null;

  return (
    <section className="mt-10">
      <CollapsibleBlock
        title={`Отложенные · ${posts.length}`}
        preview="отклонённые и снятые с показа"
      >
        <ul className="space-y-2">
          {posts.map((post) => (
            <li
              key={post.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-glass p-3"
            >
              {post.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.imageUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="h-14 w-14 shrink-0 rounded-lg bg-bg-1" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text-0">
                  {post.title || post.slug}
                </p>
                <p className="truncate text-xs text-text-2">
                  {post.contentDate} · {post.category}
                </p>
                <span className={`${badgeClass} mt-1`}>
                  {/* `stageHint(post.reviewStatus)` для скрытого после
                      публикации отвечал бы «Опубликовано и видно в ленте» —
                      `reviewStatus` у него так и остаётся `published`, хотя
                      из ленты пост уже убран. */}
                  {post.status === "hidden"
                    ? "Скрыто из ленты"
                    : stageHint(post.reviewStatus)}
                </span>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {/* Только для скрытого — тот же PATCH, что и в
                    «Опубликованных». У по-настоящему отклонённого
                    (`reviewStatus: 'rejected'`) пути назад без повторной
                    проверки нет, и кнопки здесь для него нет. */}
                {post.status === "hidden" && (
                  <button
                    type="button"
                    disabled={pending[post.id] !== undefined}
                    onClick={() =>
                      run(post.id, "restore", {
                        path: `/admin/motivation/posts/${post.id}`,
                        method: "PATCH",
                        body: { hidden: false },
                      })
                    }
                    aria-label="Вернуть в ленту"
                    title="Вернуть в ленту"
                    className={iconButton}
                  >
                    <Eye aria-hidden className="size-5" />
                  </button>
                )}
                <DeletePostButton
                  postId={post.id}
                  title={post.title || post.slug}
                  status={post.status}
                  pendingAction={pending[post.id]}
                  run={run}
                />
                {errors[post.id] && (
                  <p role="alert" className="mt-2 w-full text-sm font-medium text-red-500">
                    {errors[post.id]}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CollapsibleBlock>
    </section>
  );
}
