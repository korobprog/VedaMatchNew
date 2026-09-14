import { TravelNav } from "@/components/travel/travel-nav";
import { GuestsView } from "@/components/travel/guests-view";

export const metadata = {
  title: "Клиентская база — Путешествия",
  robots: { index: false, follow: false },
};

export default async function StayGuestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <TravelNav />
      <GuestsView stayId={id} />
    </main>
  );
}
