import { TravelNav } from "@/components/travel/travel-nav";
import { StaysView } from "@/components/travel/stays-view";

export const metadata = {
  title: "Путешествия — где остановиться в пути",
  description:
    "Отели, хостелы, ашрамы и комнаты у преданных — за плату или за служение.",
  robots: { index: false, follow: false },
};

export default function TravelPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-2 font-display text-3xl text-text-0">Путешествия</h1>
      <p className="mb-6 text-sm text-text-1">
        Выберите место на карте и посмотрите, где там можно переночевать.
      </p>
      <TravelNav />
      <StaysView />
    </main>
  );
}
