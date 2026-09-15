import { TravelNav } from "@/components/travel/travel-nav";
import { StayCalendarView } from "@/components/travel/stay-calendar-view";

export const metadata = {
  title: "Календарь — Путешествия",
  robots: { index: false, follow: false },
};

export default async function StayCalendarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <TravelNav />
      <StayCalendarView stayId={id} />
    </main>
  );
}
