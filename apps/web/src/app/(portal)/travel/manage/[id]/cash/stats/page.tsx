import { TravelNav } from "@/components/travel/travel-nav";
import { CashStatsView } from "@/components/travel/cash-stats-view";

export const metadata = {
  title: "Статистика кассы — Путешествия",
  robots: { index: false, follow: false },
};

export default async function StayCashStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <TravelNav />
      <CashStatsView stayId={id} />
    </main>
  );
}
