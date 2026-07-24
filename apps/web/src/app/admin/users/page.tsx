import Link from "next/link";
import { redirect } from "next/navigation";
import type { DevoteeVerificationStatus, Role, SpiritualStage } from "@vedamatch/shared";
import { Header } from "@/components/header";
import { getAdminUsers, getProfile } from "@/lib/api";
import { formatDate, roleLabels, stageLabels, verificationLabels } from "@/lib/admin-labels";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { cn } from "@/lib/utils";

const roles: Array<Role | "all"> = ["all", "user", "admin", "service-admin"];
const stages: Array<SpiritualStage | "all"> = ["all", "seeker", "practitioner", "yogi", "devotee"];
const statuses: Array<DevoteeVerificationStatus | "all"> = [
  "all",
  "self_identified",
  "awaiting_mentor",
  "mentor_submitted",
  "awaiting_admin",
  "confirmed",
  "rejected",
  "needs_clarification",
];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = normalizeQuery(raw);
  const user = await getProfile();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const users = await getAdminUsers(query);
  if (!users) throw new Error("Не удалось загрузить пользователей");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-0">Пользователи</h1>
            <p className="mt-1 text-text-1">
              Поиск, фильтры, этапы, заявки наставников и доступность сервисов.
            </p>
          </div>
          <Link href="/admin/verification-requests" className="rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 hover:border-magenta/30">
            Заявки на подтверждение
          </Link>
        </div>

        <form className="mb-6 grid gap-3 glass rounded-2xl border border-glass-brd p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-text-1">
            Поиск
            <input name="q" defaultValue={query.q} placeholder="Имя или email" className="mt-1 w-full rounded-xl border border-glass-brd bg-glass px-3 py-2 text-text-0" />
          </label>
          <Select name="role" label="Роль" value={query.role} options={roles.map((r) => ({ value: r, label: r === "all" ? "Все" : roleLabels[r] }))} />
          <Select name="spiritualStage" label="Этап" value={query.spiritualStage} options={stages.map((s) => ({ value: s, label: s === "all" ? "Все" : stageLabels[s] }))} />
          <Select name="verificationStatus" label="Статус" value={query.verificationStatus} options={statuses.map((s) => ({ value: s, label: s === "all" ? "Все" : verificationLabels[s] }))} />
          <Select name="hasMentorRequest" label="Заявка наставника" value={query.hasMentorRequest} options={[{ value: "all", label: "Все" }, { value: "true", label: "Есть" }, { value: "false", label: "Нет" }]} />
          <Select name="sortBy" label="Сортировка" value={query.sortBy} options={[{ value: "createdAt", label: "Дата регистрации" }, { value: "lastSelfIdentificationAt", label: "Последняя анкета" }, { value: "status", label: "Статус" }]} />
          <Select name="sortDir" label="Порядок" value={query.sortDir} options={[{ value: "desc", label: "Сначала новые" }, { value: "asc", label: "Сначала старые" }]} />
          <Select name="pageSize" label="На странице" value={query.pageSize} options={["10", "20", "50", "100"].map((v) => ({ value: v, label: v }))} />
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-medium text-white hover:shadow-[0_0_20px_rgba(255,62,158,0.4)]">Применить</button>
            <Link href="/admin/users" className="rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0">Сбросить</Link>
          </div>
        </form>

        {users.items.length === 0 ? (
          <div className="glass rounded-2xl border border-glass-brd p-8 text-center text-text-1">
            Пользователи не найдены. Попробуйте изменить фильтры.
          </div>
        ) : (
          <div className="overflow-hidden glass rounded-2xl border border-glass-brd">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-glass-brd text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-text-2">
                  <tr>
                    <th className="px-4 py-3">Пользователь</th>
                    <th className="px-4 py-3">Роль</th>
                    <th className="px-4 py-3">Этап</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3">Анкета</th>
                    <th className="px-4 py-3">Регистрация</th>
                    <th className="px-4 py-3">Заявка</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-brd">
                  {users.items.map((item) => (
                    <tr key={item.id} className="hover:bg-glass/50">
                      <td className="px-4 py-3">
                        <Link href={`/admin/users/${item.id}`} className="font-medium text-text-0 hover:text-magenta">
                          {item.name}
                        </Link>
                        <div className="text-xs text-text-2">{item.email}</div>
                      </td>
                      <td className="px-4 py-3 text-text-1">{roleLabels[item.role]}</td>
                      <td className="px-4 py-3">{item.spiritualStage ? <Badge>{stageLabels[item.spiritualStage]}</Badge> : "—"}</td>
                      <td className="px-4 py-3">{item.devoteeVerificationStatus ? <Badge tone={item.devoteeVerificationStatus === "confirmed" ? "green" : "amber"}>{verificationLabels[item.devoteeVerificationStatus]}</Badge> : "—"}</td>
                      <td className="px-4 py-3 text-text-2">{formatDate(item.lastSelfIdentificationAt)}</td>
                      <td className="px-4 py-3 text-text-2">{formatDate(item.createdAt)}</td>
                      <td className="px-4 py-3">{item.hasMentorRequest ? <Badge tone="blue">{item.mentorRequestStatus ? verificationLabels[item.mentorRequestStatus] : "Есть"}</Badge> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-text-2">
          <span>Всего: {users.total}. Страница {users.page} из {users.totalPages}.</span>
          <div className="flex gap-2">
            <PageLink disabled={users.page <= 1} page={users.page - 1} query={query}>Назад</PageLink>
            <PageLink disabled={users.page >= users.totalPages} page={users.page + 1} query={query}>Вперёд</PageLink>
          </div>
        </div>
      </main>
    </div>
  );
}

function normalizeQuery(raw: Record<string, string | string[] | undefined>) {
  const one = (key: string) => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return {
    q: one("q") ?? "",
    role: one("role") && one("role") !== "all" ? one("role") : undefined,
    spiritualStage: one("spiritualStage") && one("spiritualStage") !== "all" ? one("spiritualStage") : undefined,
    verificationStatus: one("verificationStatus") && one("verificationStatus") !== "all" ? one("verificationStatus") : undefined,
    hasMentorRequest: one("hasMentorRequest") && one("hasMentorRequest") !== "all" ? one("hasMentorRequest") : undefined,
    sortBy: one("sortBy") ?? "createdAt",
    sortDir: one("sortDir") ?? "desc",
    page: one("page") ?? "1",
    pageSize: one("pageSize") ?? "20",
  };
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="text-sm font-medium text-text-1">
      {label}
      <select name={name} defaultValue={value ?? "all"} className="mt-1 w-full rounded-xl border border-glass-brd bg-glass px-3 py-2 text-text-0">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function Badge({ children, tone = "amber" }: { children: React.ReactNode; tone?: "amber" | "green" | "blue" }) {
  const classes = {
    amber: "bg-gold/20 text-gold border border-gold/30",
    green: "bg-cyan/20 text-cyan border border-cyan/30",
    blue: "bg-magenta/20 text-magenta border border-magenta/30",
  }[tone];
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", classes)}>{children}</span>;
}

function PageLink({ disabled, page, query, children }: { disabled: boolean; page: number; query: Record<string, string | undefined>; children: React.ReactNode }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, page: String(page) })) {
    if (value) params.set(key, value);
  }
  return disabled ? (
    <span className="rounded-xl glass border border-glass-brd px-4 py-2 text-text-2">{children}</span>
  ) : (
    <Link href={`/admin/users?${params.toString()}`} className="rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 hover:border-magenta/30">{children}</Link>
  );
}
