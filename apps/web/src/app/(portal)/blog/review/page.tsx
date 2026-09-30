import Link from "next/link";
import { notFound } from "next/navigation";
import { canAdminService } from "@vedamatch/shared";
import { getBlogFeedRequests } from "@/lib/blog-api";
import { requireUser } from "@/lib/require-user";
import { BlogFeedReview } from "@/components/blog/blog-feed-review";

export const metadata = {
  title: "Предложено в ленту",
  robots: { index: false, follow: false },
};

/**
 * Очередь постов с личных страниц, которые авторы предложили в общую ленту
 * (VED-686). Не администратору страницы нет вовсе: 404, а не редирект, чтобы
 * адрес не выдавал, что тут что-то есть.
 */
export default async function BlogReviewPage() {
  const user = await requireUser();
  const isAdmin = canAdminService(
    { role: user.role, adminServices: user.adminServices },
    "blog",
  );
  if (!isAdmin) notFound();

  const queue = await getBlogFeedRequests();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <Link
        href="/blog"
        className="inline-flex min-h-11 items-center text-sm text-text-1 underline underline-offset-2"
      >
        Блог-лента
      </Link>
      <h1 className="mb-4 font-display text-2xl font-bold text-text-0 sm:text-3xl">
        Предложено в ленту
      </h1>
      <BlogFeedReview initial={queue?.posts ?? []} />
    </main>
  );
}
