import Link from "next/link";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { ReaderScreen } from "@/components/vedabase/reader-screen";
import { getProfile } from "@/lib/api";

type Params = Promise<{ bookSlug: string; chapterSlug: string }>;
type Query = Promise<{ fromPost?: string }>;

export default async function VedabaseReaderPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Query;
}) {
  const user = await getProfile();
  if (!user) {
    const { bookSlug, chapterSlug } = await params;
    redirectToLogin(`/vedabase/books/${bookSlug}/${chapterSlug}`);
  }

  const { bookSlug, chapterSlug } = await params;
  /* Откуда пришли. Из «Вдохновения» в главу ведёт ссылка «Комментарий», и
     дорога назад там одна — к тому самому афоризму, а не в оглавление
     библиотеки, которого человек не открывал. Приходит только slug карточки:
     он подставляется в запрос к заведомо своему адресу, чужой ссылкой сюда
     не подменить, куда уводит кнопка. */
  const { fromPost } = await searchParams;
  const back = fromPost
    ? {
        href: `/motivation?post=${encodeURIComponent(fromPost)}`,
        label: "← К афоризму",
      }
    : { href: "/vedabase", label: "← К библиотеке" };

  return (
    <div className="min-h-dvh bg-bg-0">
      <Header user={user} />
      {/* Липкая: глава длинная, а выход из неё нужен на любом стихе, не
          только на первом экране. */}
      <div className="sticky top-0 z-20 bg-bg-0/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <Link
            href={back.href}
            className="text-sm font-medium text-gold transition-colors hover:text-magenta"
          >
            {back.label}
          </Link>
        </div>
      </div>
      <ReaderScreen userId={user.id} bookSlug={bookSlug} chapterSlug={chapterSlug} />
    </div>
  );
}
