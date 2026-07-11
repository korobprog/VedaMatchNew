import type { VedabaseLibraryManifest } from "@vedamatch/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { getProfile } from "@/lib/api";
import { getVedabaseLibrary } from "@/lib/vedabase-api";

export default async function VedabasePage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  const library = await getVedabaseLibrary();
  if (!library) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <VedabaseLibraryShell userId={user.id} library={library} />
    </div>
  );
}

function VedabaseLibraryShell({
  userId,
  library,
}: {
  userId: string;
  library: VedabaseLibraryManifest;
}) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8" data-vedabase-user={userId}>
      <section className="mb-8">
        <p className="text-sm font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">
          Vedabase
        </p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          Библиотека
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Каталог из {library.books.length} книг. Загрузка для чтения офлайн и
          поиск появятся в панели библиотеки.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {library.books.map((book) => {
          const firstChapter = book.chapters[0];
          return (
            <article
              key={book.slug}
              className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {book.title}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                {book.author ?? "Автор не указан"}
              </p>
              <p className="mt-4 text-xs text-zinc-500">
                {formatBytes(book.sizeBytes)} · {book.chapters.length} гл.
              </p>
              {firstChapter ? (
                <Link
                  href={`/vedabase/books/${encodeURIComponent(book.slug)}/${encodeURIComponent(firstChapter.slug)}`}
                  className="mt-5 inline-flex w-fit rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  Читать
                </Link>
              ) : (
                <span className="mt-5 text-sm text-zinc-400">
                  Главы пока недоступны
                </span>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
