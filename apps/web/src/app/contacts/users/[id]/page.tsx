import Link from "next/link";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { ContactsCardView } from "@/components/contacts/contacts-card-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Карточка человека — Контакты",
  description: "Карточка участника справочника общины.",
  // Имя, город и служение конкретного человека в поисковиках не нужны.
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;

export default async function ContactsUserPage({
  params,
}: {
  params: Params;
}) {
  const user = await getProfile();
  if (!user) {
    const { id } = await params;
    redirectToLogin(`/contacts/users/${id}`);
  }

  const { id } = await params;

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <Link
          href="/contacts"
          className="mb-4 inline-block text-sm text-text-2 transition hover:text-text-0"
        >
          ← К справочнику
        </Link>

        {/* Карточка грузится в браузере тем же клиентом, что и выдача поиска:
            видимость проверяет бэкенд, а не страница. */}
        <ContactsCardView userId={id} />
      </main>
    </div>
  );
}
