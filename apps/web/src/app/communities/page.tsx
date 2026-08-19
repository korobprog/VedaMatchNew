import Link from "next/link";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { CommunitiesSearchView } from "@/components/communities/communities-search-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Общины — ятры, храмы и клубы",
  description:
    "Справочник общин: ятры, храмы, нама-хатты, фермы и клубы с адресами и участниками.",
  // Справочник с адресами и способами связи не должен попадать в поисковики.
  robots: { index: false, follow: false },
};

export default async function CommunitiesPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/communities");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-28">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
              Общины
            </h1>
            <p className="mt-1 text-sm text-text-1">
              Ятры, храмы, нама-хатты и клубы. Отметьте свою в профиле — она
              будет видна на портале значком.
            </p>
          </div>
          <Link
            href="/communities/new"
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 transition hover:text-text-0"
          >
            Завести общину
          </Link>
        </div>

        <CommunitiesSearchView />
      </main>
    </div>
  );
}
