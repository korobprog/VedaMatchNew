import Link from "next/link";
import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import type { TeamApplicationStatus } from "@vedamatch/shared";
import { getAdminTeamApplications, getProfile } from "@/lib/api";
import {
  formatDateTime,
  teamRoleLabels,
  teamStatusLabels,
  teamStatuses,
} from "@/lib/team-labels";

const filters: Array<TeamApplicationStatus | "all"> = [...teamStatuses, "all"];

const filterLabels: Record<TeamApplicationStatus | "all", string> = {
  ...teamStatusLabels,
  all: "Все",
};

export default async function AdminTeamApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.status)
    ? params.status[0]
    : params.status;
  const status = filters.includes(requested as TeamApplicationStatus | "all")
    ? (requested as TeamApplicationStatus | "all")
    : "submitted";

  const user = await getProfile();
  if (!user) redirectToLogin("/admin/team-applications");
  if (user.role !== "admin") redirect("/");

  const applications = await getAdminTeamApplications(
    status === "all" ? undefined : status,
  );
  if (!applications) throw new Error("Не удалось загрузить заявки");

  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Заявки в команду
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Новых: {applications.newCount}
      </p>

      <nav className="mb-6 flex flex-wrap gap-2">
        {filters.map((value) => (
          <Link
            key={value}
            href={`/admin/team-applications?status=${value}`}
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

      {applications.items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-8 text-center text-sm text-text-1">
          Заявок в этой категории нет.
        </p>
      ) : (
        <ul className="space-y-3">
          {applications.items.map((application) => (
            <li key={application.id}>
              <Link
                href={`/admin/team-applications/${application.id}`}
                className="glass block rounded-2xl border border-glass-brd p-5 transition hover:border-magenta/30"
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                  <span className="font-semibold text-text-0">
                    {teamRoleLabels[application.role]}
                    {application.role === "other" && application.roleOther
                      ? ` · ${application.roleOther}`
                      : ""}
                  </span>
                  <span className="rounded-full border border-glass-brd px-2.5 py-1 text-xs font-semibold text-text-1">
                    {teamStatusLabels[application.status]}
                  </span>
                </div>
                <p className="text-sm text-text-2">
                  создано {formatDateTime(application.createdAt)}
                </p>
                <p className="mt-1 text-sm text-text-2">
                  {[
                    application.contactName,
                    application.contactEmail,
                    application.contactTelegram,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "контакты не указаны"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
