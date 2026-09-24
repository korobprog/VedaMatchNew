import { WorkPayoutActView } from "@/components/work/payout-act-view";

export const metadata = {
  title: "Акт выполненных работ",
  // Ссылка на акт — секрет: суммы клиента не должны попадать в поиск.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Акт за период коммерческой доски (VED-461). Живёт ВНЕ группы (portal), как
 * экран приглашения: клиент открывает ссылку без аккаунта. Путь добавлен в
 * `publicPrefixes` веб-прокси.
 */
export default async function WorkActPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <WorkPayoutActView token={token} />
    </main>
  );
}
