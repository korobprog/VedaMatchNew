import { BasketView } from "@/components/wellness/basket-view";
import { WellnessNav } from "@/components/wellness/wellness-nav";

export const metadata = {
  title: "Корзина — Здоровье",
  description: "Отобранные продукты и что из них подходит.",
  robots: { index: false, follow: false },
};

export default function WellnessBasketPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <h1 className="font-display text-2xl font-bold text-text-0">Корзина</h1>
      <p className="mt-1 mb-6 text-sm text-text-1">
        Что вы отобрали к покупке. Вердикт пересчитывается по текущим
        ограничениям — поменяете их, и список ответит заново.
      </p>
      <WellnessNav />
      <BasketView />
    </main>
  );
}
