import { Suspense } from "react";
import { TravelNav } from "@/components/travel/travel-nav";
import { RouteListView } from "@/components/travel/map/route-list-view";

export const metadata = {
  title: "Маршруты — парикрамы, тропы и прогулки",
  description:
    "Маршруты, которые составляют сами преданные: парикрамы, тропы, прогулки по городу и экскурсии.",
  robots: { index: false, follow: false },
};

export default function TravelMapRoutesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-2 font-display text-3xl text-text-0">Маршруты</h1>
      <p className="mb-6 text-sm text-text-1">
        Парикрамы, тропы и прогулки: цепочки мест, которые можно пройти.
      </p>
      <TravelNav />
      <Suspense fallback={null}>
        <RouteListView />
      </Suspense>
    </main>
  );
}
