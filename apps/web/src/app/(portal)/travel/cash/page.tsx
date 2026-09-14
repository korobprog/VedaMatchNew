import { TravelNav } from "@/components/travel/travel-nav";
import { CashShortcutView } from "@/components/travel/cash-shortcut-view";

export const metadata = {
  title: "Касса — Путешествия",
  robots: { index: false, follow: false },
};

/** Адрес ярлыка «Касса» в меню установленного приложения. */
export default function CashShortcutPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <TravelNav />
      <CashShortcutView />
    </main>
  );
}
