import { AdminMapView } from "@/components/travel/map/admin-map-view";

export const metadata = {
  title: "Карта путешествий — админка",
  robots: { index: false, follow: false },
};

export default function AdminTravelMapPage() {
  return <AdminMapView />;
}
