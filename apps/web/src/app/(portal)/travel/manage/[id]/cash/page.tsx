import { TravelNav } from "@/components/travel/travel-nav";
import { CashView } from "@/components/travel/cash-view";

export const metadata = {
  title: "Касса — Путешествия",
  robots: { index: false, follow: false },
};

export default async function StayCashPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <TravelNav />
      <CashView stayId={id} />
    </main>
  );
}
