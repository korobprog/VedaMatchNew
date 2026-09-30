import { TravelNav } from "@/components/travel/travel-nav";
import { PlaceForm } from "@/components/travel/map/place-form";

export const metadata = {
  title: "Новое место на карте",
  robots: { index: false, follow: false },
};

export default function NewMapPlacePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl text-text-0">Новое место</h1>
      <TravelNav />
      <PlaceForm />
    </main>
  );
}
