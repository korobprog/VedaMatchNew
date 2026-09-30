import { Suspense } from "react";
import { TravelNav } from "@/components/travel/travel-nav";
import { TourListView } from "@/components/travel/map/tour-list-view";

export const metadata = {
  title: "Наборы на прогулки",
  robots: { index: false, follow: false },
};

export default function TravelMapToursPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-2 font-display text-3xl text-text-0">Наборы на прогулки</h1>
      <p className="mb-6 text-sm text-text-1">
        Прогулки по маршрутам на конкретную дату: записывайтесь.
      </p>
      <TravelNav />
      <Suspense fallback={null}>
        <TourListView />
      </Suspense>
    </main>
  );
}
