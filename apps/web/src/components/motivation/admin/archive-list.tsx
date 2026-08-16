"use client";

import type { MotivationAdminCandidateDto } from "@vedamatch/shared";
import { CollapsibleBlock } from "../collapsible-block";
import { DeletePostButton } from "./delete-post-button";
import { stageHint } from "./pipeline-stages";
import type { RunCommand } from "./use-admin-command";
import { badgeClass } from "./ui";

/**
 * Всё, что уже прошло очередь: опубликованное, отклонённое, скрытое. Список
 * компактный и свёрнут по умолчанию — он нужен, чтобы такую мотивацию можно
 * было найти и удалить, а не чтобы её перечитывать.
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
        title={`Уже прошли очередь · ${posts.length}`}
        preview="опубликованные, отклонённые, скрытые"
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
                  {stageHint(post.reviewStatus)}
                </span>
              </div>
              <div className="w-full sm:w-auto">
                <DeletePostButton
                  postId={post.id}
                  title={post.title || post.slug}
                  isPublished={post.status === "published"}
                  pendingAction={pending[post.id]}
                  run={run}
                />
                {errors[post.id] && (
                  <p role="alert" className="mt-2 text-sm font-medium text-red-500">
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
