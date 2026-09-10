import { ScannerView } from "@/components/wellness/scanner-view";
import { WellnessNav } from "@/components/wellness/wellness-nav";

export const metadata = {
  title: "Проверить продукт — Здоровье",
  description: "Штрихкод, снимок состава или цифры вручную.",
  robots: { index: false, follow: false },
};

export default function WellnessScanPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <h1 className="font-display text-2xl font-bold text-text-0">
        Проверить продукт
      </h1>
      <p className="mt-1 mb-6 text-sm text-text-1">
        Если штрихкод не читается — снимите ту часть упаковки, где написан
        состав.
      </p>
      <WellnessNav />
      <ScannerView />
    </main>
  );
}
