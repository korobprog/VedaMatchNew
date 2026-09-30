import { Suspense } from "react";
import { TravelNav } from "@/components/travel/travel-nav";
import { TourForm } from "@/components/travel/map/tour-form";

export const metadata = {
  title: "Новый набор",
  robots: { index: false, follow: false },
};

export default function NewTravelMapTourPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl text-text-0">Назначить прогулку</h1>
      <TravelNav />
      <Suspense fallback={null}>
        <TourForm />
      </Suspense>
    </main>
  );
}
