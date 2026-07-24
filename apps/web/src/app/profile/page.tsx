import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import { Header } from "@/components/header";
import { ProfileEditor } from "@/components/profile-editor";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

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
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          Профиль
        </h1>
        <div className="glass rounded-2xl border border-glass-brd p-6 mb-6">
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
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-glass text-2xl font-semibold text-text-0">
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-lg font-semibold text-text-0">
                {user.name}
              </p>
              <p className="text-sm text-text-2">{user.email}</p>
            </div>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-text-2">Роль</dt>
              <dd className="font-medium text-text-0">
                {user.role === "admin" ? "Администратор" : user.role === "service-admin" ? "Администратор сервисов" : "Пользователь"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-2">Текущий этап</dt>
              <dd className="font-medium text-text-0">
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
                <dt className="text-text-2">Статус преданного</dt>
                <dd className="font-medium text-text-0">
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
              <dt className="text-text-2">Последняя анкета</dt>
              <dd className="font-medium text-text-0">
                {user.lastSelfIdentificationAt
                  ? new Date(user.lastSelfIdentificationAt).toLocaleString("ru-RU")
                  : "Еще не проходили"}
              </dd>
            </div>
          </dl>
          <Link
            href="/self-identification"
            className="mt-6 block rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-center text-sm font-medium text-white transition hover:shadow-[0_0_24px_rgba(255,62,158,0.45)]"
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
