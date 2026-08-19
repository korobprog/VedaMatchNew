import { NoticesMapPanel } from "@/components/notices/notices-map-panel";
import { NoticesNav } from "@/components/notices/notices-nav";

export const metadata = {
  title: "Объявления на карте",
  robots: { index: false, follow: false },
};

export default async function NoticesMapPage() {

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 pb-28">
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Объявления на карте
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Двигайте карту — доска подстраивается под то, что видно. На мелком
        масштабе показываются города, на крупном — отдельные объявления.
      </p>
      <NoticesNav />
      <NoticesMapPanel />
    </main>
  );
}
