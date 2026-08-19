import { ContactsNav } from "@/components/contacts/contacts-nav";
import { ContactsDisclosuresView } from "@/components/contacts/contacts-disclosures-view";

export const metadata = {
  title: "Кому открыт доступ — Контакты",
  description: "Журнал раскрытий контактов с возможностью закрыть доступ.",
  // Список людей, знающих ваш телефон, точно не для поисковиков.
  robots: { index: false, follow: false },
};

export default async function ContactsDisclosuresPage() {

  return (
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
  );
}
