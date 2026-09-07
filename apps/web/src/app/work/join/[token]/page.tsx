import { WorkJoinView } from "@/components/work/join-view";

export const metadata = {
  title: "Приглашение в рабочую среду",
  // Ссылка-приглашение — секрет. Индексировать её нельзя ни при каких условиях.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Экран приглашения живёт ВНЕ группы (portal): туда пускают только вошедших, а
 * человек, получивший ссылку в мессенджере, аккаунта может ещё не иметь. Путь
 * добавлен в `publicPrefixes` веб-прокси — без этого гостя уносило на лендинг
 * до того, как он увидел, куда его позвали.
 */
export default async function WorkJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-4 py-10">
      <div className="w-full">
        <WorkJoinView token={token} />
      </div>
    </main>
  );
}
