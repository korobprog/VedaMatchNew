import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { ReaderScreen } from "@/components/vedabase/reader-screen";
import { getProfile } from "@/lib/api";

type Params = Promise<{ bookSlug: string; chapterSlug: string }>;

export default async function VedabaseReaderPage({ params }: { params: Params }) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { bookSlug, chapterSlug } = await params;

  return (
    <div className="min-h-screen bg-bg-0">
      <Header user={user} />
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <Link
          href="/vedabase"
          className="text-sm font-medium text-gold transition-colors hover:text-magenta"
        >
          ← К библиотеке
        </Link>
      </div>
      <ReaderScreen userId={user.id} bookSlug={bookSlug} chapterSlug={chapterSlug} />
    </div>
  );
}
