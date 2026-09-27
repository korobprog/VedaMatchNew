"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Pencil, Share2 } from "lucide-react";
import type { BlogPostDto } from "@vedamatch/shared";
import { LineageMenuButton } from "@/components/lineage-menu-button";
import { setBlogPostCategory, setBlogPostLineage } from "@/lib/blog-client-api";
import { BlogCategoryButton } from "./blog-category-button";
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
     «Поделиться», а где его нет — ссылка в буфер обмена. С VED-590 —
     значком, без подписи: в ряд встали «Категория» и «Линия». */
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
      {/* С переносом: у админа, который ещё и автор, в ряду шесть кнопок, и
          на 360 точках правая группа уходит второй строкой, а не за экран. */}
      <div className="relative mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/blog"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-glass-brd px-3 text-sm text-text-1 hover:border-cyan/60"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Вся лента
        </Link>
        {/* «Порядок кнопок» (VED-509) — слева от «Поделиться»: кнопки под
            постом переставляются отсюда для всей ленты. */}
        <div className="ml-auto flex items-center gap-2">
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
          {/* «Назначить категорию» (VED-590) — у того, кто может править
              пост: автор и администратор. У репоста правки нет, и
              категории тоже. */}
          {post.canEdit && (
            <BlogCategoryButton
              value={post.category ?? null}
              onSelect={async (category) => {
                setPost(await setBlogPostCategory(post.id, category));
              }}
            />
          )}
          {/* «Линия» (VED-596) — значок-домик, как в Образовании и
              Медиатеке, и только у администратора: линия решает, кому пост
              виден в отфильтрованной ленте. У репоста линия своя, не
              оригинала: фильтр ленты смотрит на строку самого репоста. */}
          {post.canModerate && (
            <LineageMenuButton
              value={post.lineage ?? null}
              buttonClassName="rounded-lg"
              menuLabel="Линия поста"
              onSelect={async (lineage) => {
                setPost(await setBlogPostLineage(post.id, lineage));
              }}
            />
          )}
          <button
            type="button"
            onClick={() => void share()}
            aria-label={copied ? "Ссылка скопирована" : "Поделиться"}
            title={copied ? "Ссылка скопирована" : "Поделиться"}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-glass-brd text-text-1 hover:border-cyan/60"
          >
            {copied ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <Share2 aria-hidden className="size-4" />
            )}
          </button>
          {/* Подписи у значка нет — о скопированной ссылке скринридеру
              говорит отдельная строка. */}
          <span role="status" className="sr-only">
            {copied ? "Ссылка скопирована" : ""}
          </span>
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
