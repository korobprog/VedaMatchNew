import Link from "next/link";
import type { AdminPortalStats, AdminQueueCounter } from "@vedamatch/shared";
import { getAdminPortalStats } from "@/lib/api";
import { visibleAdminNav } from "@/lib/admin-nav";
import { requireUser } from "@/lib/require-user";

export const metadata = {
  title: "Админка",
  robots: { index: false, follow: false },
};

/** Куда ведёт очередь и как она называется на карточке. */
const QUEUE_META: Record<
  AdminQueueCounter["key"],
  { label: string; href: string }
> = {
  userReports: { label: "Жалобы на людей", href: "/admin/reports" },
  supportTickets: { label: "Обращения в поддержку", href: "/admin/tickets" },
  verificationRequests: {
    label: "Заявки на проверку",
    href: "/admin/verification-requests",
  },
  communities: { label: "Сообщества на подтверждении", href: "/admin/communities" },
};

export default async function AdminHomePage() {
  const user = await requireUser();
  // Портальная сводка есть только у роли admin: администратор сервиса видит
  // сразу разделы, а лишний запрос за 403 ему делать незачем.
  const stats = user.role === "admin" ? await getAdminPortalStats() : null;
  const groups = visibleAdminNav(user);

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
        Админка
      </h1>
      <p className="mt-1 text-sm text-text-1">
        {user.role === "admin"
          ? "Состояние платформы и разделы управления."
          : "Разделы сервисов, которыми вы управляете."}
      </p>

      {stats && (
        <>
          <section className="mt-6" aria-labelledby="admin-people">
            <h2
              id="admin-people"
              className="mb-3 font-display text-lg font-semibold text-text-0"
            >
              Люди
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile label="Всего" value={stats.users.total} />
              <StatTile label="За сутки" value={stats.users.seenLast24Hours} />
              <StatTile label="Новых за 7 дней" value={stats.users.newLast7Days} />
              <StatTile
                label="Новых за 30 дней"
                value={stats.users.newLast30Days}
              />
              <StatTile
                label="Платных подписок"
                value={stats.users.paidSubscriptions}
              />
            </div>
            {stats.users.blocked > 0 && (
              <p className="mt-2 text-sm text-text-1">
                Заблокировано аккаунтов: {stats.users.blocked}
              </p>
            )}
          </section>

          <section className="mt-8" aria-labelledby="admin-queues">
            <h2
              id="admin-queues"
              className="mb-3 font-display text-lg font-semibold text-text-0"
            >
              Ждёт разбора
            </h2>
            <QueueList queues={stats.queues} />
          </section>
        </>
      )}

      {groups.map((group) => (
        <section key={group.title} className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
            {group.title}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="glass rounded-2xl border border-glass-brd p-4 transition-colors hover:border-magenta/40"
              >
                <span className="font-display font-semibold text-text-0">
                  {item.label}
                </span>
                <span className="mt-1 block text-sm text-text-1">
                  {item.hint}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function QueueList({ queues }: { queues: AdminPortalStats["queues"] }) {
  const waiting = queues.filter((queue) => queue.count > 0);
  if (waiting.length === 0) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
        Разобрано всё: открытых жалоб, обращений и заявок нет.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {waiting.map((queue) => (
        <li key={queue.key}>
          <Link
            href={QUEUE_META[queue.key].href}
            className="glass flex items-center justify-between gap-3 rounded-2xl border border-glass-brd p-4 transition-colors hover:border-magenta/40"
          >
            <span className="text-sm text-text-0">
              {QUEUE_META[queue.key].label}
            </span>
            <span className="font-mono text-lg font-semibold text-text-0">
              {queue.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl border border-glass-brd p-4">
      <p className="font-mono text-2xl font-semibold text-text-0">{value}</p>
      <p className="mt-1 text-sm text-text-1">{label}</p>
    </div>
  );
}
