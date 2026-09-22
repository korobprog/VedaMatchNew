import { notFound } from "next/navigation";
import { getBlogAuthorFeed } from "@/lib/blog-api";
import { requireUser } from "@/lib/require-user";
import { BlogAuthorFeed } from "@/components/blog/blog-author-feed";
import { plural } from "@/lib/plural";

export const metadata = {
  title: "Блог участника",
  robots: { index: false, follow: false },
};

/**
 * Личный блог участника (VED-116).
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
  const feed = await getBlogAuthorFeed(userId);
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
      </div>

      <BlogAuthorFeed initial={feed} authorId={feed.author.id} mine={mine} />
    </main>
  );
}
