import { HistoryList } from "@/components/wellness/history-list";
import { WellnessNav } from "@/components/wellness/wellness-nav";

export const metadata = {
  title: "История проверок — Здоровье",
  description: "Что вы проверяли и что мы тогда ответили.",
  robots: { index: false, follow: false },
};

export default function WellnessHistoryPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <h1 className="font-display text-2xl font-bold text-text-0">История</h1>
      <p className="mt-1 mb-6 text-sm text-text-1">
        Вердикт записан на момент проверки: состав и справочник потом правятся.
      </p>
      <WellnessNav />
      <HistoryList />
    </main>
  );
}
