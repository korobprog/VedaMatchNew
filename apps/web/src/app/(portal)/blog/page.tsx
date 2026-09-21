import { canAdminService } from "@vedamatch/shared";
import { getBlogFeed, getBlogSettings } from "@/lib/blog-api";
import { requireUser } from "@/lib/require-user";
import { BlogFeed } from "@/components/blog/blog-feed";
import { BlogSettingsForm } from "@/components/blog/blog-settings-form";

export const metadata = {
  title: "Блог-лента — что происходит на портале",
  description:
    "Посты участников с фотографиями: что происходит прямо сейчас, и весь архив прошлых постов.",
  // Лента с именами и фотографиями людей не должна попадать в поисковики.
  robots: { index: false, follow: false },
};

/**
 * Полная лента (VED-238): «При нажатии на это окно должна открываться полная
 * лента со всеми прошлыми постами» — поэтому здесь `scope=all`, с постами,
 * которые уже вышли из ленты главной по сроку.
 */
export default async function BlogPage() {
  const user = await requireUser();
  const isAdmin = canAdminService(
    { role: user.role, adminServices: user.adminServices },
    "blog",
  );
  const [feed, settings] = await Promise.all([
    getBlogFeed("all"),
    isAdmin ? getBlogSettings() : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Блог-лента
        </h1>
        <p className="mt-1 text-sm text-text-1">
          Что происходит у людей портала прямо сейчас. Здесь же лежат все
          прошлые посты — те, что уже ушли из ленты на главной.
        </p>
      </div>

      {settings && <BlogSettingsForm initial={settings} />}

      <BlogFeed initial={feed ?? { posts: [], nextCursor: null }} scope="all" />
    </main>
  );
}
