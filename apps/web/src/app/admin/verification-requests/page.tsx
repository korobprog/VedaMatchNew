import Link from "next/link";
import { redirect } from "next/navigation";
import type { DevoteeVerificationStatus } from "@vedamatch/shared";
import { getAdminVerificationRequests, getProfile } from "@/lib/api";
import { Header } from "@/components/header";
import { AdminVerificationList } from "@/components/admin-verification-list";

const statusFilters: Array<{ value: DevoteeVerificationStatus | "all"; label: string }> = [
  { value: "all", label: "Все" },
  { value: "awaiting_mentor", label: "Ожидает наставника" },
  { value: "awaiting_admin", label: "Ожидает администратора" },
  { value: "confirmed", label: "Подтверждено" },
  { value: "rejected", label: "Отклонено" },
  { value: "needs_clarification", label: "Требует уточнения" },
];

const allowedStatuses = new Set<DevoteeVerificationStatus>([
  "self_identified",
  "awaiting_mentor",
  "mentor_submitted",
  "awaiting_admin",
  "confirmed",
  "rejected",
  "needs_clarification",
]);

export default async function AdminVerificationRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const rawStatus = (await searchParams).status;
  const selectedStatus = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
  const status =
    selectedStatus && allowedStatuses.has(selectedStatus as DevoteeVerificationStatus)
      ? (selectedStatus as DevoteeVerificationStatus)
      : undefined;

  const [user, requests] = await Promise.all([
    getProfile(),
    getAdminVerificationRequests(status),
  ]);
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "service-admin") redirect("/");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Заявки на подтверждение
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Проверка наставника и решение администратора по статусу “Преданный”.
        </p>

        <div className="mb-6 flex flex-wrap gap-2">
          {statusFilters.map((filter) => {
            const active = (filter.value === "all" && !status) || filter.value === status;
            return (
              <Link
                key={filter.value}
                href={
                  filter.value === "all"
                    ? "/admin/verification-requests"
                    : `/admin/verification-requests?status=${filter.value}`
                }
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-amber-600 text-white"
                    : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {filter.label}
              </Link>
            );
          })}
        </div>

        <AdminVerificationList requests={requests ?? []} />
      </main>
    </div>
  );
}
