import { TravelNav } from "@/components/travel/travel-nav";
import { GuideForm } from "@/components/travel/map/guide-form";

export const metadata = {
  title: "Профиль экскурсовода",
  robots: { index: false, follow: false },
};

export default function TravelMapMyGuidePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl text-text-0">
        Профиль экскурсовода
      </h1>
      <TravelNav />
      <GuideForm />
    </main>
  );
}
