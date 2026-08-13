import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { ContactsNav } from "@/components/contacts/contacts-nav";
import { ContactsDisclosuresView } from "@/components/contacts/contacts-disclosures-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Кому открыт доступ — Контакты",
  description: "Журнал раскрытий контактов с возможностью закрыть доступ.",
  // Список людей, знающих ваш телефон, точно не для поисковиков.
  robots: { index: false, follow: false },
};

export default async function ContactsDisclosuresPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <h1 className="mb-1 font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Кому открыт доступ
        </h1>
        <p className="mb-6 text-sm text-text-1">
          Журнал раскрытий: кому и когда вы открыли свои способы связи. Закрытые
          доступы остаются в списке — это история, а не список действующих.
        </p>

        <ContactsNav />
        <ContactsDisclosuresView />
      </main>
    </div>
  );
}
