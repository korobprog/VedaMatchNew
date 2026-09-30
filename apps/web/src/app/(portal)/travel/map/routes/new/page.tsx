import { TravelNav } from "@/components/travel/travel-nav";
import { RouteForm } from "@/components/travel/map/route-form";

export const metadata = {
  title: "Новый маршрут",
  robots: { index: false, follow: false },
};

export default function NewMapRoutePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl text-text-0">Новый маршрут</h1>
      <TravelNav />
      <RouteForm />
    </main>
  );
}
