import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { getProfile } from "@/lib/api";

type Params = Promise<{ bookSlug: string; chapterSlug: string }>;

export default async function VedabaseReaderPage({
  params,
}: {
  params: Params;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { bookSlug, chapterSlug } = await params;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <VedabaseReaderShell
        userId={user.id}
        bookSlug={bookSlug}
        chapterSlug={chapterSlug}
      />
    </div>
  );
}

function VedabaseReaderShell({
  userId,
  bookSlug,
  chapterSlug,
}: {
  userId: string;
  bookSlug: string;
  chapterSlug: string;
}) {
  return (
    <main
      className="mx-auto max-w-4xl px-4 py-8"
      data-vedabase-user={userId}
      data-book-slug={bookSlug}
      data-chapter-slug={chapterSlug}
    >
      <Link
        href="/vedabase"
        className="text-sm font-medium text-amber-700 hover:text-amber-800 dark:text-amber-300"
      >
        ← К библиотеке
      </Link>
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">{bookSlug}</p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {chapterSlug}
        </h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Текст главы загружается клиентской читалкой из проверенного локального
          пакета.
        </p>
      </section>
    </main>
  );
}
