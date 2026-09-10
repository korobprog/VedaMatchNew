import { TravelNav } from "@/components/travel/travel-nav";
import { BookingsView } from "@/components/travel/bookings-view";

export const metadata = {
  title: "Мои заявки — Путешествия",
  robots: { index: false, follow: false },
};

export default function TravelBookingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-4 font-display text-3xl text-text-0">Мои заявки</h1>
      <TravelNav />
      <BookingsView />
    </main>
  );
}
