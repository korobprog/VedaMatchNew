import { ContactsNav } from "@/components/contacts/contacts-nav";
import { ContactsProfileEditor } from "@/components/contacts/contacts-profile-editor";

export const metadata = {
  title: "Моя карточка — Контакты",
  description: "Справочник людей общины: как вас увидят другие участники",
};

export default async function ContactsProfilePage() {

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-28">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-0">
          Моя карточка
        </h1>
        <p className="mt-1 text-sm text-text-1">
          Справочник людей общины: расскажите о себе и решите, кому вас видно.
        </p>
      </div>

      <ContactsNav />
      <ContactsProfileEditor />
    </main>
  );
}
