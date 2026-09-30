import { Suspense } from "react";
import { TravelNav } from "@/components/travel/travel-nav";
import { TourForm } from "@/components/travel/map/tour-form";

export const metadata = {
  title: "Изменить набор",
  robots: { index: false, follow: false },
};

export default async function EditTravelMapTourPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl text-text-0">Изменить набор</h1>
      <TravelNav />
      <Suspense fallback={null}>
        <TourForm tourId={id} />
      </Suspense>
    </main>
  );
}
