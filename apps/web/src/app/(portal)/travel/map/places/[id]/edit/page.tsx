import { TravelNav } from "@/components/travel/travel-nav";
import { PlaceForm } from "@/components/travel/map/place-form";

export const metadata = {
  title: "Изменить место",
  robots: { index: false, follow: false },
};

export default async function EditMapPlacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl text-text-0">Изменить место</h1>
      <TravelNav />
      <PlaceForm placeId={id} />
    </main>
  );
}
