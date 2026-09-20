import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { Navbar } from "@/components/landing/Navbar";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { BankRequisites } from "@/components/donate/bank-requisites";
import { CopyField } from "@/components/donate/copy-field";
import { TransferPurposeForm } from "@/components/donate/transfer-purpose";
import { getDonationSettings, getProfile } from "@/lib/api";
import { DONATE_PURPOSE_EXPLAINER } from "@/lib/donate-content";

export const metadata: Metadata = {
  title: "Поддержать",
  description:
    "Портал VedaMatch живёт на пожертвования. Здесь — как подписать назначение перевода, чтобы мы знали, за что он пришёл.",
};

/**
 * Раздел «Поддержать» (VED-11, VED-12).
 *
 * До этой страницы просьба о помощи жила одной кнопкой со шторкой реквизитов
 * (`components/donate-sheet.tsx`): человек видел номер карты и ничего больше —
 * ни за что перевод, ни куда уходят деньги. Здесь появляется главное, чего там
 * не было: просьба подписать назначение платежа (VED-11) и реквизиты, включая
 * банковские (VED-12). Статьи расходов приедут следующей карточкой.
 *
 * Открыта и гостю: просьба о помощи за входом — это просьба к тем, кто уже
 * внутри, а не ко всем. Шторка реквизитов остаётся: она нужна там, где человек
 * уже что-то делает (лента «Вдохновения», статистика), и ведёт сюда ссылкой.
 */
export default async function DonatePage() {
  const [user, donation] = await Promise.all([getProfile(), getDonationSettings()]);
  const quick = donation?.enabled ? donation.requisites : [];

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

        {quick.length > 0 && (
          <section className="mb-10" aria-labelledby="quick">
            <h2
              id="quick"
              className="mb-2 font-display text-lg font-semibold text-text-0"
            >
              Быстрый перевод
            </h2>
            <p className="mb-4 text-sm text-text-1">
              {donation?.text ||
                "Самый короткий путь: перевод по номеру телефона, карте или ссылке."}
            </p>
            <ul className="space-y-2">
              {quick.map((item, index) => (
                <li key={`${item.kind}-${index}`}>
                  {item.kind === "link" ? (
                    <a
                      href={item.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm transition-colors hover:bg-bg-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs uppercase tracking-wide text-text-2">
                          {item.label}
                        </span>
                        <span className="block truncate font-mono text-text-0">
                          {item.value}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-cyan">
                        Открыть
                      </span>
                    </a>
                  ) : (
                    <CopyField label={item.label} value={item.value} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* VED-12: банки. */}
        <section className="mb-10" aria-labelledby="banks">
          <h2
            id="banks"
            className="mb-2 font-display text-lg font-semibold text-text-0"
          >
            Наши банки
          </h2>
          <p className="mb-4 text-sm text-text-1">
            Перевод по реквизитам — для тех, кому так привычнее, и для платежей
            из-за рубежа. Не забудьте назначение платежа из блока выше.
          </p>
          <BankRequisites />
        </section>

        <p className="text-sm text-text-1">
          Вопрос про перевод, нужен другой способ или чек — напишите в{" "}
          <Link
            href="/support"
            className="font-medium text-cyan underline decoration-cyan/40 underline-offset-2"
          >
            поддержку
          </Link>
          . Сколько нас и как растёт портал — на странице{" "}
          <Link
            href="/stats"
            className="font-medium text-cyan underline decoration-cyan/40 underline-offset-2"
          >
            статистики
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
