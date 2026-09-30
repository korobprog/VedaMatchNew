import { PeopleCardView } from "@/components/chat/people/people-card-view";
import { isPortalStaff } from "@vedamatch/shared";
import { PersonalPageLink } from "@/components/personal-page-link";
import { requireUser } from "@/lib/require-user";

export const metadata = {
  title: "Карточка человека — Общение",
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
  const [{ id }, user] = await Promise.all([params, requireUser()]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
      {/* Вход на личную страницу человека (VED-685) — над карточкой справа. */}
      <div className="mb-4 flex justify-end">
        <PersonalPageLink userId={id} own={id === user.id} />
      </div>
      {/* Карточка грузится в браузере тем же клиентом, что и выдача поиска:
          видимость проверяет бэкенд, а не страница. */}
      <PeopleCardView
        userId={id}
        viewerId={user.id}
        viewerIsStaff={isPortalStaff(user.role)}
      />
    </main>
  );
}
