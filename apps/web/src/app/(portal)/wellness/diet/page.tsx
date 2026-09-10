import { DietForm } from "@/components/wellness/diet-form";
import { WellnessNav } from "@/components/wellness/wellness-nav";

export const metadata = {
  title: "Мои ограничения — Здоровье",
  description: "Что вы не едите: по этому списку сканер выносит вердикт.",
  robots: { index: false, follow: false },
};

export default function WellnessDietPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <h1 className="font-display text-2xl font-bold text-text-0">
        Мои ограничения
      </h1>
      <p className="mt-1 mb-6 text-sm text-text-1">
        По этому списку сканер решает, подходит вам продукт или нет. Список
        видите только вы.
      </p>
      <WellnessNav />
      <DietForm />
    </main>
  );
}
