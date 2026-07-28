import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupportTicketStatus } from "@vedamatch/shared";
import { Header } from "@/components/header";
import { getAdminSupportTickets, getProfile } from "@/lib/api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import {
  formatDateTime,
  formatWaiting,
  ticketCategoryLabels,
  ticketStatusClasses,
  ticketStatusLabels,
  ticketStatuses,
} from "@/lib/support-labels";

const filters: Array<SupportTicketStatus | "all"> = [...ticketStatuses, "all"];

const filterLabels: Record<SupportTicketStatus | "all", string> = {
  ...ticketStatusLabels,
  all: "Все",
};

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = filters.includes(requested as SupportTicketStatus | "all")
    ? (requested as SupportTicketStatus | "all")
    : "open";

  const user = await getProfile();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const tickets = await getAdminSupportTickets(
    status === "all" ? undefined : status,
  );
  if (!tickets) throw new Error("Не удалось загрузить обращения");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
          Обращения в поддержку
        </h1>
        <p className="mb-6 text-sm text-text-1">
          В работе и новых: {tickets.openCount}
        </p>

        <nav className="mb-6 flex flex-wrap gap-2">
          {filters.map((value) => (
            <Link
              key={value}
              href={`/admin/tickets?status=${value}`}
              aria-current={value === status ? "page" : undefined}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                value === status
                  ? "border-magenta/40 bg-magenta/10 text-text-0"
                  : "glass border-glass-brd text-text-1 hover:text-text-0"
              }`}
            >
              {filterLabels[value]}
            </Link>
          ))}
        </nav>

        {tickets.items.length === 0 ? (
          <p className="glass rounded-2xl border border-glass-brd p-8 text-center text-sm text-text-1">
            Обращений в этой категории нет.
          </p>
        ) : (
          <ul className="space-y-3">
            {tickets.items.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/admin/tickets/${ticket.id}`}
                  className="glass block rounded-2xl border border-glass-brd p-5 transition hover:border-magenta/30"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                    <span className="font-semibold text-text-0">
                      №{ticket.number} · {ticket.subject}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {ticket.waitingMinutes !== null && (
                        <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-500">
                          Без ответа {formatWaiting(ticket.waitingMinutes)}
                        </span>
                      )}
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${ticketStatusClasses[ticket.status]}`}
                      >
                        {ticketStatusLabels[ticket.status]}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-text-2">
                    {ticketCategoryLabels[ticket.category]} · создано{" "}
                    {formatDateTime(ticket.createdAt)} · сообщений{" "}
                    {ticket.messageCount}
                  </p>
                  <p className="mt-1 text-sm text-text-2">
                    {ticket.requester
                      ? `${ticket.requester.name} (${ticket.requester.email})`
                      : `Гость: ${[ticket.contactName, ticket.contactEmail, ticket.contactTelegram]
                          .filter(Boolean)
                          .join(" · ")}`}
                    {ticket.assignedTo && ` · ведёт ${ticket.assignedTo.name}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
