import Link from "next/link";
import type { Metadata } from "next";
import { getMySupportTickets, getProfile } from "@/lib/api";
import { Header } from "@/components/header";
import { Navbar } from "@/components/landing/Navbar";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { SupportTicketForm } from "@/components/support/support-ticket-form";
import {
  formatDateTime,
  ticketCategoryLabels,
  ticketStatusClasses,
  ticketStatusLabels,
} from "@/lib/support-labels";

export const metadata: Metadata = {
  title: "Поддержка",
  description:
    "Задайте вопрос поддержке VedaMatch. Обращение можно отправить без регистрации — ответим на email или в Telegram.",
};

export default async function SupportPage() {
  const user = await getProfile();
  const tickets = user ? await getMySupportTickets() : null;

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      {user ? <Header user={user} /> : <Navbar />}

      <main
        className={`mx-auto max-w-3xl px-4 pb-24 ${user ? "py-8" : "pt-28 pb-24"}`}
      >
        <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
          Поддержка
        </h1>
        <p className="mb-8 text-text-1">
          {user
            ? "Обращения из кабинета привязаны к вашему аккаунту: здесь виден статус и время создания каждого тикета."
            : "Обращение можно отправить без регистрации — оставьте email или Telegram, и мы ответим. Ссылку на отслеживание вы получите сразу после отправки."}
        </p>

        {user && tickets && (
          <section className="mb-10">
            <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
              Мои обращения{" "}
              {tickets.openCount > 0 && (
                <span className="text-sm font-normal text-text-2">
                  · в работе: {tickets.openCount}
                </span>
              )}
            </h2>

            {tickets.items.length === 0 ? (
              <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
                Обращений пока нет. Напишите нам через форму ниже.
              </p>
            ) : (
              <ul className="space-y-3">
                {tickets.items.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={`/support/${ticket.id}`}
                      className="glass block rounded-2xl border border-glass-brd p-4 transition hover:border-magenta/30"
                    >
                      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
                        <span className="font-semibold text-text-0">
                          №{ticket.number} · {ticket.subject}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${ticketStatusClasses[ticket.status]}`}
                        >
                          {ticketStatusLabels[ticket.status]}
                        </span>
                      </div>
                      <p className="text-sm text-text-2">
                        {ticketCategoryLabels[ticket.category]} · создано{" "}
                        {formatDateTime(ticket.createdAt)} ·{" "}
                        {ticket.firstResponseAt
                          ? `первый ответ ${formatDateTime(ticket.firstResponseAt)}`
                          : "ждёт первого ответа"}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
            Новое обращение
          </h2>
          <SupportTicketForm authorized={Boolean(user)} />
        </section>

        {!user && (
          <p className="mt-6 text-sm text-text-2">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="underline hover:text-text-1">
              Войдите
            </Link>
            , чтобы вся переписка хранилась в профиле.
          </p>
        )}
      </main>
    </div>
  );
}
