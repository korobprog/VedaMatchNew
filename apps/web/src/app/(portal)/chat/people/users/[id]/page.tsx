import Link from "next/link";
import { PeopleCardView } from "@/components/chat/people/people-card-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Карточка человека — Общение",
  description: "Карточка участника справочника общины.",
  // Имя, город и служение конкретного человека в поисковиках не нужны.
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;

export default async function PeopleUserPage({
  params,
}: {
  params: Params;
}) {
  const [{ id }, viewer] = await Promise.all([params, getProfile()]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <Link
        href="/chat/people"
        className="mb-4 inline-block text-sm text-text-2 transition hover:text-text-0"
      >
        ← К справочнику
      </Link>

      {/* Карточка грузится в браузере тем же клиентом, что и выдача поиска:
          видимость проверяет бэкенд, а не страница. */}
      <PeopleCardView userId={id} viewerId={viewer?.id ?? null} />
    </main>
  );
}
