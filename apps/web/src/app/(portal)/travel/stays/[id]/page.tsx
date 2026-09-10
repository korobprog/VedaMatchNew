import { TravelNav } from "@/components/travel/travel-nav";
import { StayView } from "@/components/travel/stay-view";

export const metadata = {
  title: "Место ночлега — Путешествия",
  robots: { index: false, follow: false },
};

export default async function TravelStayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <TravelNav />
      <StayView stayId={id} />
    </main>
  );
}
