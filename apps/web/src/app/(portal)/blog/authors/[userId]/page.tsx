import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import {
  getBlogAuthorAlbum,
  getBlogAuthorFeed,
  getBlogAuthorFiles,
} from "@/lib/blog-api";
import { getDirectChatWith } from "@/lib/chat-api";
import { requireUser } from "@/lib/require-user";
import { PersonalMiniChat } from "@/components/chat/personal-mini-chat";
import { BlogAuthorFeed } from "@/components/blog/blog-author-feed";
import { BlogAuthorAbout } from "@/components/blog/blog-author-about";
import { BlogAuthorFiles } from "@/components/blog/blog-author-files";
import { BlogAuthorAlbum } from "@/components/blog/blog-author-album";
import { plural } from "@/lib/plural";

export const metadata = {
  title: "Блог участника",
  robots: { index: false, follow: false },
};

/**
 * Личная страница участника (VED-686) — выросла из личного блога (VED-116):
 * шапка, «О себе», «Написать» в мессенджер и посты автора.
 *
 * Свой блог — это собственные посты человека в общей ленте, собранные на
 * одной странице: заводить для них отдельную сущность значило бы иметь два
 * разных «поста» с двумя редакторами и двумя лентами.
 *
 * Срок нахождения в ленте здесь не действует: он управляет тем, что видно
 * на главной, а блог — архив автора целиком.
 */
export default async function BlogAuthorPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const viewer = await requireUser();
  // Свою страницу открывают смотреть свои посты: мини-чат с собой не нужен,
  // и запрос к мессенджеру за ним не стоит.
  const minePage = userId === viewer.id;
  const [feed, files, album, chat] = await Promise.all([
    getBlogAuthorFeed(userId),
    getBlogAuthorFiles(userId),
    getBlogAuthorAlbum(userId),
    minePage ? Promise.resolve(null) : getDirectChatWith(userId),
  ]);
  if (!feed) notFound();

  const mine = feed.author.id === viewer.id;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <div className="mb-6 flex items-center gap-4">
        {feed.author.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={feed.author.avatarUrl}
            alt=""
            className="size-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-bg-2 font-display text-xl text-text-1"
          >
            {feed.author.name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-text-0">
            {mine ? "Мой блог" : feed.author.name}
          </h1>
          <p className="mt-0.5 text-sm text-text-1">
            {feed.total > 0
              ? `${feed.total} ${plural(feed.total, "пост", "поста", "постов")}`
              : "Пока ни одного поста"}
            {!mine && " · блог участника"}
          </p>
        </div>
        {!mine && (
          <Link
            href={`/chat/with/${encodeURIComponent(feed.author.id)}`}
            className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-glass-brd px-3 py-2 text-sm font-semibold text-text-0 transition-colors hover:bg-bg-2"
          >
            <MessageCircle aria-hidden className="size-4" />
            Написать
          </Link>
        )}
      </div>

      {/* Миниатюра мессенджера (VED-686): переписка с хозяином страницы прямо
          здесь, а кнопка в шапке открывает полноценный мессенджер. */}
      {!mine && (
        <PersonalMiniChat
          initial={chat}
          companion={{ id: feed.author.id, name: feed.author.name }}
          viewerId={viewer.id}
        />
      )}

      <BlogAuthorAbout initial={feed.about} mine={mine} />

      <BlogAuthorFiles initial={files?.files ?? []} mine={mine} />

      <BlogAuthorAlbum initial={album?.photos ?? []} mine={mine} />

      <BlogAuthorFeed initial={feed} authorId={feed.author.id} mine={mine} />
    </main>
  );
}
