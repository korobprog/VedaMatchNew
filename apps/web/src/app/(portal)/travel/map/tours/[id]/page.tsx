import { TravelNav } from "@/components/travel/travel-nav";
import { TourView } from "@/components/travel/map/tour-view";

export const metadata = {
  title: "Набор на прогулку",
  robots: { index: false, follow: false },
};

export default async function TravelMapTourPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <TravelNav />
      <TourView id={id} />
    </main>
  );
}
