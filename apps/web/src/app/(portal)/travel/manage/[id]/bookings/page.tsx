import { TravelNav } from "@/components/travel/travel-nav";
import { StayBookingsView } from "@/components/travel/stay-bookings-view";

export const metadata = {
  title: "Заявки на объект — Путешествия",
  robots: { index: false, follow: false },
};

export default async function StayBookingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <TravelNav />
      <StayBookingsView stayId={id} />
    </main>
  );
}
