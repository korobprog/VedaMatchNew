import { TravelNav } from "@/components/travel/travel-nav";
import { GuideListView } from "@/components/travel/map/guide-list-view";

export const metadata = {
  title: "Экскурсоводы",
  robots: { index: false, follow: false },
};

export default function TravelMapGuidesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-2 font-display text-3xl text-text-0">Экскурсоводы</h1>
      <p className="mb-6 text-sm text-text-1">
        Люди, которые водят по маршрутам. Записаться можно на набор.
      </p>
      <TravelNav />
      <GuideListView />
    </main>
  );
}
