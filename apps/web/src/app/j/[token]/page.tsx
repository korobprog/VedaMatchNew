import { ConferenceJoinView } from "@/components/chat/conference/conference-join-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Приглашение в конференцию",
  // Ссылка — секрет. Индексировать её нельзя ни при каких условиях.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Короткая ссылка на конференцию: `vedamatch.ru/j/<токен>`.
 *
 * Живёт ВНЕ группы `(portal)` и стоит в `publicPrefixes` веб-прокси: ссылку
 * пересылают в мессенджер, и получатель аккаунта может ещё не иметь. Без
 * этого гостя унесло бы на лендинг раньше, чем он увидел, куда его зовут, —
 * и вернуло бы потом на лендинг же.
 *
 * Адрес короткий и без имени сервиса намеренно: его диктуют вслух и
 * пересылают. Прецедент в портале есть — `/m/<id>` у профиля. Маршруты API
 * при этом остаются под префиксом сервиса (`chat/conference/*`).
 */
export default async function ConferenceJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Вошёл ли человек, знает только сервер: у карточки приглашения ответ
  // одинаковый для гостя и для вошедшего, а вести их надо по-разному.
  const user = await getProfile().catch(() => null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-4 py-10">
      <div className="w-full">
        <ConferenceJoinView token={token} signedIn={Boolean(user)} />
      </div>
    </main>
  );
}
