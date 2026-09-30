import { Suspense } from "react";
import { TravelNav } from "@/components/travel/travel-nav";
import { MapView } from "@/components/travel/map/map-view";

export const metadata = {
  title: "Карта — храмы, общины и вегетарианские места",
  description:
    "Народная карта: храмы, общины, вегетарианские кафе и магазины, харинамы и святые места.",
  robots: { index: false, follow: false },
};

export default function TravelMapPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-2 font-display text-3xl text-text-0">Карта</h1>
      <p className="mb-6 text-sm text-text-1">
        Места, которые отмечают сами преданные. Не нашли своё — добавьте.
      </p>
      <TravelNav />
      <Suspense fallback={null}>
        <MapView />
      </Suspense>
    </main>
  );
}
