import { Suspense } from "react";
import { WalkView } from "@/components/travel/map/walk-view";

export const metadata = {
  title: "Прогулка по маршруту",
  robots: { index: false, follow: false },
};

export default async function MapRouteWalkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <WalkView id={id} />
    </Suspense>
  );
}
