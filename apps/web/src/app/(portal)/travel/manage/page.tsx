import { TravelNav } from "@/components/travel/travel-nav";
import { ManageView } from "@/components/travel/manage-view";

export const metadata = {
  title: "Моё жильё — Путешествия",
  robots: { index: false, follow: false },
};

export default function TravelManagePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-4 font-display text-3xl text-text-0">Моё жильё</h1>
      <TravelNav />
      <ManageView />
    </main>
  );
}
