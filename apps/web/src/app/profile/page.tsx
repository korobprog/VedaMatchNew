import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import { Header } from "@/components/header";
import { ProfileEditor } from "@/components/profile-editor";

const roleLabels: Record<string, string> = {
  user: "Пользователь",
  admin: "Администратор",
  "service-admin": "Администратор сервисов",
};

const stageLabels: Record<string, string> = {
  seeker: "Ищущий",
  practitioner: "Практикующий основы",
  yogi: "Йог",
  devotee: "Преданный",
};

const verificationLabels: Record<string, string> = {
  self_identified: "Самоопределен",
  awaiting_mentor: "Ожидает наставника",
  mentor_submitted: "Наставник заполнил форму",
  awaiting_admin: "Ожидает администратора",
  confirmed: "Подтвержденный преданный",
  rejected: "Отклонен",
  needs_clarification: "Требует уточнения",
};

export default async function ProfilePage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Профиль
        </h1>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-6 flex items-center gap-4">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-16 w-16 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-2xl font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {user.name}
              </p>
              <p className="text-sm text-zinc-500">{user.email}</p>
            </div>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Роль</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                {roleLabels[user.role] ?? user.role}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Текущий этап</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                {user.spiritualStage
                  ? getStageDisplayName(
                      user.spiritualStage,
                      user.devoteeVerificationStatus,
                    )
                  : "Не определен"}
              </dd>
            </div>
            {user.devoteeVerificationStatus && (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Статус преданного</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                  {user.spiritualStage === "devotee"
                    ? getStageDisplayName(
                        user.spiritualStage,
                        user.devoteeVerificationStatus,
                      )
                    : verificationLabels[user.devoteeVerificationStatus]}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Последняя анкета</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                {user.lastSelfIdentificationAt
                  ? new Date(user.lastSelfIdentificationAt).toLocaleString("ru-RU")
                  : "Еще не проходили"}
              </dd>
            </div>
          </dl>
          <Link
            href="/self-identification"
            className="mt-6 block rounded-xl bg-amber-600 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-amber-700"
          >
            Пройти самоидентификацию заново
          </Link>
        </div>
        <ProfileEditor user={user} />
      </main>
    </div>
  );
}

function getStageDisplayName(
  stage: string,
  status: string | null | undefined,
) {
  if (stage !== "devotee") return stageLabels[stage] ?? stage;
  return status === "confirmed"
    ? "Преданный, подтвержден"
    : "Преданный, не подтвержден";
}
