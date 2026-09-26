"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Pencil, Share2 } from "lucide-react";
import type { BlogPostDto } from "@vedamatch/shared";
import { BlogPostCard } from "./blog-post-card";
import { PostActionsOrderButton } from "./post-actions-order-button";

/**
 * Один пост целиком (VED-238): «нажатие на картинку или на заголовок должно
 * открывать данный конкретный пост и не должно открывать историю — другие
 * посты». Здесь и автор, и дата, и все действия — тот самый «полный
 * разворот», куда уехала подпись автора с главной. Текст развёрнут сразу:
 * человек пришёл читать именно этот пост.
 */
export function BlogPostView({ initial }: { initial: BlogPostDto }) {
  const router = useRouter();
  const [post, setPost] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [editRequest, setEditRequest] = useState(0);

  /* «Поделиться» (VED-491) — справа от «Вся лента»: системное окно
     «Поделиться», а где его нет — ссылка в буфер обмена. */
  async function share() {
    const shown = post.repostOf ?? post;
    const url = `${window.location.origin}/blog/posts/${encodeURIComponent(post.id)}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: shown.title ?? "Блог-лента VedaMatch",
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Окно «Поделиться» закрыли — это не ошибка.
    }
  }

  return (
    <>
      <div className="relative mb-4 flex items-center justify-between gap-2">
        <Link
          href="/blog"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-glass-brd px-3 text-sm text-text-1 hover:border-cyan/60"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Вся лента
        </Link>
        {/* «Порядок кнопок» (VED-509) — слева от «Поделиться»: кнопки под
            постом переставляются отсюда для всей ленты. */}
        <div className="flex items-center gap-2">
          <PostActionsOrderButton />
          {/* «Редактировать» и сверху (VED-495): под длинным постом до
              нижней кнопки «слишком долго мотать». На телефоне — значком,
              иначе ряд с «Поделиться» не влезает в 360 точек. */}
          {post.canEdit && (
            <button
              type="button"
              onClick={() => setEditRequest((value) => value + 1)}
              aria-label="Редактировать"
              title="Редактировать"
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-glass-brd px-3 text-sm text-text-1 hover:border-cyan/60 max-sm:px-0"
            >
              <Pencil aria-hidden className="size-4" />
              <span className="hidden sm:inline">Редактировать</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-glass-brd px-3 text-sm text-text-1 hover:border-cyan/60"
          >
            {copied ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <Share2 aria-hidden className="size-4" />
            )}
            {copied ? "Ссылка скопирована" : "Поделиться"}
          </button>
        </div>
      </div>
      <BlogPostCard
        post={post}
        expanded
        editRequest={editRequest}
        onChanged={setPost}
        // Пост удалён — показывать больше нечего, возвращаем в ленту.
        onRemoved={() => router.replace("/blog")}
      />
    </>
  );
}
