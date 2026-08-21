import Link from "next/link";
import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import type { UserReportStatus } from "@vedamatch/shared";
import { AdminReportList } from "@/components/admin-report-list";
import { getAdminUserReports, getProfile } from "@/lib/api";

const statuses: Array<UserReportStatus | "all"> = [
  "open",
  "reviewed",
  "dismissed",
  "all",
];

const statusLabels: Record<UserReportStatus | "all", string> = {
  open: "Новые",
  reviewed: "Рассмотренные",
  dismissed: "Отклонённые",
  all: "Все",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.status)
    ? params.status[0]
    : params.status;
  const status = statuses.includes(requested as UserReportStatus | "all")
    ? (requested as UserReportStatus | "all")
    : "open";

  const user = await getProfile();
  if (!user) redirectToLogin("/admin/reports");
  if (user.role !== "admin") redirect("/");

  const reports = await getAdminUserReports(status === "all" ? undefined : status);
  if (!reports) throw new Error("Не удалось загрузить жалобы");

  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Жалобы пользователей
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Новых жалоб: {reports.openCount}
      </p>

      <nav className="mb-6 flex flex-wrap gap-2">
        {statuses.map((value) => (
          <Link
            key={value}
            href={`/admin/reports?status=${value}`}
            aria-current={value === status ? "page" : undefined}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              value === status
                ? "border-magenta/40 bg-magenta/10 text-text-0"
                : "glass border-glass-brd text-text-1 hover:text-text-0"
            }`}
          >
            {statusLabels[value]}
          </Link>
        ))}
      </nav>

      <AdminReportList reports={reports.items} />
    </>
  );
}
