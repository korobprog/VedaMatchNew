import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { ContactsNav } from "@/components/contacts/contacts-nav";
import { ContactsRequestsView } from "@/components/contacts/contacts-requests-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Мои запросы — Контакты",
  description: "Запросы контакта: входящие и исходящие.",
  // Переписка о контактах конкретных людей в поисковиках не нужна.
  robots: { index: false, follow: false },
};

export default async function ContactsRequestsPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <h1 className="mb-1 font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Мои запросы
        </h1>
        <p className="mb-6 text-sm text-text-1">
          Кто просит ваши контакты и кому их попросили вы.
        </p>

        <ContactsNav />
        <ContactsRequestsView />
      </main>
    </div>
  );
}
