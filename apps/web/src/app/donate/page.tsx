import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Header } from "@/components/header";
import { Navbar } from "@/components/landing/Navbar";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { CopyField } from "@/components/donate/copy-field";
import { ExpenseBreakdown } from "@/components/donate/expense-breakdown";
import { TransferPurposeForm } from "@/components/donate/transfer-purpose";
import { getDonationSettings, getProfile } from "@/lib/api";
import {
  DONATE_PURPOSE_EXPLAINER,
  DONATE_RECIPIENTS,
} from "@/lib/donate-content";

export const metadata: Metadata = {
  title: "Поддержать",
  description:
    "Портал VedaMatch живёт на пожертвования. Здесь — куда перевести, как подписать назначение платежа и на что уходят деньги.",
};

/**
 * Раздел «Поддержать» (VED-11, VED-12, VED-62).
 *
 * До этой страницы просьба о помощи жила одной кнопкой со шторкой реквизитов
 * (`components/donate-sheet.tsx`): человек видел номер карты и ничего больше —
 * ни за что перевод, ни куда уходят деньги. Здесь всё это на одном экране:
 *
 * - назначение платежа, которое просим подписать (VED-11);
 * - быстрый перевод: имена, телефоны и карты получателей из админки (VED-12);
 * - статьи расходов (VED-62).
 *
 * Каркас банковских реквизитов (счёт, БИК, корсчёт, зарубежный перевод) со
 * страницы снят: заказчик вычеркнул его целиком при разборе прода 21.09 —
 * счетов у портала нет, а пустые карточки «уточняется» только занимали экран.
 * Единственный способ перевода на странице — «Быстрый перевод» из админки, а
 * на месте вычеркнутого стоит просьба написать получателю в личку.
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
          серверы, хранилище и нейросети. Любая сумма помогает — и мы
          показываем, на что она уходит.
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
                        {item.note && (
                          <span className="block text-xs text-text-1">
                            {item.note}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-cyan">
                        Открыть
                      </span>
                    </a>
                  ) : (
                    <CopyField
                      label={item.label}
                      value={item.value}
                      note={item.note}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* VED-12: что стоит на месте вычеркнутых карточек с реквизитами.
            Счетов у портала нет, а всё нестандартное — перевод из-за рубежа,
            другой банк — решается перепиской с получателем, а не ещё одним
            пустым полем на странице. */}
        <section className="mb-10" aria-labelledby="ask-recipients">
          <h2
            id="ask-recipients"
            className="mb-2 font-display text-lg font-semibold text-text-0"
          >
            Нужны другие реквизиты
          </h2>
          <p className="mb-4 text-sm text-text-1">
            Дополнительные реквизиты — перевод из-за рубежа, другой банк, счёт
            для организации — можно уточнить у получателей: напишите им в личку
            в мессенджере портала.
            {!user && (
              <>
                {" "}
                Переписка за входом: по ссылке портал попросит войти и вернёт в
                диалог.
              </>
            )}
          </p>
          <ul className="flex flex-wrap gap-2">
            {DONATE_RECIPIENTS.map((person) => (
              <li key={person.userId}>
                <Link
                  href={`/chat/with/${person.userId}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm font-medium text-text-0 transition-colors hover:bg-bg-2"
                >
                  <MessageCircle aria-hidden className="size-4 shrink-0 text-cyan" />
                  Написать: {person.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* VED-62: смета. */}
        <section className="mb-10" aria-labelledby="expenses">
          <h2
            id="expenses"
            className="mb-2 font-display text-lg font-semibold text-text-0"
          >
            На что уходят деньги
          </h2>
          <p className="mb-4 text-sm text-text-1">
            Это не благотворительный фонд с отчётом аудитора, но порядок трат мы
            показываем честно: вот статьи, за которые портал платит каждый месяц.
          </p>
          <ExpenseBreakdown />
        </section>

        {/* Ссылку на статистику заказчик вычеркнул: страница про перевод, и
            уводить с неё в цифры портала он не захотел. Осталась поддержка —
            единственный ответ на «а как иначе» и «нужен чек». */}
        <p className="text-sm text-text-1">
          Вопрос про перевод, нужен другой способ или чек — напишите в{" "}
          <Link
            href="/support"
            className="font-medium text-cyan underline decoration-cyan/40 underline-offset-2"
          >
            поддержку
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
