import Link from "next/link";
import { redirect } from "next/navigation";
import type { DevoteeVerificationStatus } from "@vedamatch/shared";
import { getAdminVerificationRequests, getProfile } from "@/lib/api";
import { Header } from "@/components/header";
import { AdminVerificationList } from "@/components/admin-verification-list";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { cn } from "@/lib/utils";

const statusFilters: Array<{ value: DevoteeVerificationStatus | "all"; label: string }> = [
  { value: "all", label: "Все" },
  { value: "awaiting_mentor", label: "Не подтвержден · наставник" },
  { value: "awaiting_admin", label: "Не подтвержден · админ" },
  { value: "confirmed", label: "Преданный, подтвержден" },
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
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
          Заявки на подтверждение
        </h1>
        <p className="mb-6 text-text-1">
          Проверка наставника и решение администратора по статусу &laquo;Преданный&raquo;.
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
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  active
                    ? "bg-gradient-to-r from-magenta to-[#B23EFF] text-white"
                    : "glass border border-glass-brd text-text-1 hover:text-text-0 hover:border-magenta/30"
                )}
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
