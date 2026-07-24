import type { VedabaseLibraryManifest } from "@vedamatch/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { getProfile } from "@/lib/api";
import { getVedabaseLibrary } from "@/lib/vedabase-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export default async function VedabasePage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  const library = await getVedabaseLibrary();
  if (!library) redirect("/login");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
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
    <main className="mx-auto max-w-6xl px-4 py-8 pb-24" data-vedabase-user={userId}>
      <section className="mb-8">
        <p className="text-sm font-semibold tracking-wide text-cyan uppercase">
          Vedabase
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-text-0">
          Библиотека
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-1">
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
              className="glass flex flex-col rounded-2xl border border-glass-brd p-5"
            >
              <h2 className="font-display text-lg font-semibold text-text-0">
                {book.title}
              </h2>
              <p className="mt-1 text-sm text-text-2">
                {book.author ?? "Автор не указан"}
              </p>
              <p className="mt-4 text-xs text-text-2">
                {formatBytes(book.sizeBytes)} · {book.chapters.length} гл.
              </p>
              {firstChapter ? (
                <Link
                  href={`/vedabase/books/${encodeURIComponent(book.slug)}/${encodeURIComponent(firstChapter.slug)}`}
                  className="mt-5 inline-flex w-fit rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-medium text-white hover:shadow-[0_0_20px_rgba(255,62,158,0.4)]"
                >
                  Читать
                </Link>
              ) : (
                <span className="mt-5 text-sm text-text-2">
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
