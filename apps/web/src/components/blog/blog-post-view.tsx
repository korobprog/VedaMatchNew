"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { BlogPostDto } from "@vedamatch/shared";
import { BlogPostCard } from "./blog-post-card";

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

  return (
    <>
      <Link
        href="/blog"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-glass-brd px-3 text-sm text-text-1 hover:border-cyan/60"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Вся лента
      </Link>
      <BlogPostCard
        post={post}
        expanded
        onChanged={setPost}
        // Пост удалён — показывать больше нечего, возвращаем в ленту.
        onRemoved={() => router.replace("/blog")}
      />
    </>
  );
}
