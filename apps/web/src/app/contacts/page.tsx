import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { ContactsNav } from "@/components/contacts/contacts-nav";
import { ContactsSearchView } from "@/components/contacts/contacts-search-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Контакты — справочник общины",
  description:
    "Найдите человека в общине: служение, профессия, навык, город и язык.",
  // Каталог живых людей с городами не должен попадать в поисковики.
  robots: { index: false, follow: false },
};

export default async function ContactsSearchPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-28">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
            Контакты
          </h1>
          <p className="mt-1 text-sm text-text-1">
            Справочник людей общины: служение, профессия, навык. Здесь ищут
            нужного человека, а не знакомства.
          </p>
        </div>

        {/* Отсюда — к своим запросам, журналу раскрытий и своей карточке. */}
        <ContactsNav />

        {/* useSearchParams внутри требует границы Suspense. */}
        <Suspense
          fallback={
            <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
              Загружаем справочник…
            </p>
          }
        >
          <ContactsSearchView />
        </Suspense>
      </main>
    </div>
  );
}
