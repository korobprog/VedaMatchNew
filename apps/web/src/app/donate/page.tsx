import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { Navbar } from "@/components/landing/Navbar";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { CopyField } from "@/components/donate/copy-field";
import { ExpenseBreakdown } from "@/components/donate/expense-breakdown";
import { TransferPurposeForm } from "@/components/donate/transfer-purpose";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  getDonationRecipients,
  getDonationSettings,
  getProfile,
} from "@/lib/api";
import {
  DONATE_INTRO,
  DONATE_OTHER_REQUISITES,
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
 * Тексты разделов — слово в слово из описания карточки VED-12 («Готово.
 * Исправленный вариант», 21.09), они лежат в `lib/donate-content.ts`.
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
  const [user, donation, recipientPhotos] = await Promise.all([
    getProfile(),
    getDonationSettings(),
    // Фото — украшение: упавший запрос не должен ронять страницу с
    // реквизитами.
    getDonationRecipients().catch(() => null),
  ]);
  const quick = donation?.enabled ? donation.requisites : [];
  // Фото не пришло (API недоступен, человека нет на стенде) — кнопка всё
  // равно рисуется, с буквой имени вместо фото.
  const photoOf = new Map(
    (recipientPhotos ?? []).map((item) => [item.userId, item.avatarUrl]),
  );

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
        <p className="mb-8 text-text-1">{DONATE_INTRO}</p>

        {/* VED-11: главная просьба страницы — подписанное назначение. Она идёт
            первой, до реквизитов: человек, уже открывший приложение банка,
            обратно за целью перевода не вернётся. */}
        <section className="mb-10" aria-labelledby="purpose">
          <h2
            id="purpose"
            className="mb-2 font-display text-lg font-semibold text-text-0"
          >
            Подпишите назначение перевода
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
            Если нужны другие реквизиты
          </h2>
          <p className="mb-4 text-sm text-text-1">
            {DONATE_OTHER_REQUISITES}
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
                {/* Заказчик: имя и фото профиля. «Написать» — только для
                    скринридера: ссылка ведёт в личку, и без глагола голое
                    имя звучало бы как ссылка на профиль. */}
                <Link
                  href={`/chat/with/${person.userId}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-glass-brd bg-bg-1 py-1.5 pl-1.5 pr-3 text-sm font-medium text-text-0 transition-colors hover:bg-bg-2"
                >
                  <UserAvatar
                    name={person.name}
                    avatarUrl={photoOf.get(person.userId)}
                    size={32}
                  />
                  <span>
                    <span className="sr-only">Написать: </span>
                    {person.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* VED-62: смета. Заголовок и статьи — из текста заказчика в VED-12
            (21.09); абзац «Это не благотворительный фонд…» он в свой вариант
            раздела не включил, и вступление страницы теперь само говорит, что
            расходы «указаны ниже». */}
        <section className="mb-10" aria-labelledby="expenses">
          <h2
            id="expenses"
            className="mb-3 font-display text-lg font-semibold text-text-0"
          >
            На что нужны средства
          </h2>
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
