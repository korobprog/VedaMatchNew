import { AdminTravelView } from "@/components/travel/admin-travel-view";

export const metadata = {
  title: "Путешествия — админка",
  robots: { index: false, follow: false },
};

export default function AdminTravelPage() {
  return <AdminTravelView />;
}
