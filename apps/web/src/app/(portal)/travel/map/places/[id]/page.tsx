import { TravelNav } from "@/components/travel/travel-nav";
import { PlaceView } from "@/components/travel/map/place-view";

export const metadata = {
  title: "Место на карте",
  robots: { index: false, follow: false },
};

export default async function MapPlacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <TravelNav />
      <PlaceView id={id} />
    </main>
  );
}
