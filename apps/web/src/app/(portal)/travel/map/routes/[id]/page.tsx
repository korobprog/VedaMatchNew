import { TravelNav } from "@/components/travel/travel-nav";
import { RouteView } from "@/components/travel/map/route-view";

export const metadata = {
  title: "Маршрут",
  robots: { index: false, follow: false },
};

export default async function MapRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <TravelNav />
      <RouteView id={id} />
    </main>
  );
}
