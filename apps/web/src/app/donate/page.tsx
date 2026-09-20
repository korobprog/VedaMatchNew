import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { Navbar } from "@/components/landing/Navbar";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { TransferPurposeForm } from "@/components/donate/transfer-purpose";
import { getProfile } from "@/lib/api";
import { DONATE_PURPOSE_EXPLAINER } from "@/lib/donate-content";

export const metadata: Metadata = {
  title: "Поддержать",
  description:
    "Портал VedaMatch живёт на пожертвования. Здесь — как подписать назначение перевода, чтобы мы знали, за что он пришёл.",
};

/**
 * Раздел «Поддержать» (VED-11).
 *
 * До этой страницы просьба о помощи жила одной кнопкой со шторкой реквизитов
 * (`components/donate-sheet.tsx`): человек видел номер карты и ничего больше —
 * ни за что перевод, ни куда уходят деньги. Здесь появляется главное, чего там
 * не было, — просьба подписать назначение платежа; реквизиты банков и статьи
 * расходов приедут следующими карточками.
 *
 * Открыта и гостю: просьба о помощи за входом — это просьба к тем, кто уже
 * внутри, а не ко всем. Шторка реквизитов остаётся: она нужна там, где человек
 * уже что-то делает (лента «Вдохновения», статистика), и ведёт сюда ссылкой.
 */
export default async function DonatePage() {
  const user = await getProfile();

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      {user ? <Header user={user} /> : <Navbar />}

      <main
        className={`mx-auto max-w-3xl px-4 pb-24 ${user ? "py-8" : "pb-24 pt-28"}`}
      >
        <h1 className="mb-2 font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Поддержать VedaMatch
        </h1>
        <p className="mb-8 text-text-1">
          Портал держится на пожертвованиях: подписки не покрывают счета за
          серверы, хранилище и генерацию картинок. Любая сумма помогает.
        </p>

        {/* VED-11: главная просьба страницы — подписанное назначение. Она идёт
            первой, до реквизитов: человек, уже открывший приложение банка,
            обратно за целью перевода не вернётся. */}
        <section className="mb-10" aria-labelledby="purpose">
          <h2
            id="purpose"
            className="mb-2 font-display text-lg font-semibold text-text-0"
          >
            Подпишите, пожалуйста, назначение перевода
          </h2>
          {/* Текст просьбы — из donate-content.ts: его меняют одной строкой,
              не трогая вёрстку, и он же стоит в шторке реквизитов. */}
          <p className="mb-4 text-sm text-text-1">{DONATE_PURPOSE_EXPLAINER}</p>
          <TransferPurposeForm />
        </section>

        <p className="text-sm text-text-1">
          Вопрос про перевод, нужен другой способ или чек — напишите в{" "}
          <Link
            href="/support"
            className="font-medium text-cyan underline decoration-cyan/40 underline-offset-2"
          >
            поддержку
          </Link>
          . Реквизиты для перевода — в шторке «Поддержать развитие
          VedaMatch» на{" "}
          <Link
            href="/stats"
            className="font-medium text-cyan underline decoration-cyan/40 underline-offset-2"
          >
            странице статистики
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
