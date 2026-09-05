import Link from "next/link";
import type { PricingPlan, SubscriptionState } from "@vedamatch/shared";
import { redirectToLogin } from "@/lib/require-user";
import { getBillingPlan, getProfile } from "@/lib/api";
import { getRewardsMe } from "@/lib/rewards-api";
import { PLAN as DEFAULT_PLAN } from "@/lib/plan";
import { formatDate, subscriptionStatusLabels } from "@/lib/support-labels";
import { Header } from "@/components/header";
import { ProfileEditor } from "@/components/profile-editor";
import { CommunityPicker } from "@/components/communities/community-picker";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { LogoutButton } from "@/components/logout-button";
import { DeleteAccountSection } from "@/components/delete-account-section";
import { RewardsProfileCard } from "@/components/rewards/rewards-profile-card";
import { InstallButton } from "@/components/pwa/install-button";
import { NotificationSettings } from "@/components/pwa/notification-settings";

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
  const [user, fetchedPlan, rewards] = await Promise.all([
    getProfile(),
    getBillingPlan().catch(() => null),
    // Упавший сервис баллов убирает одну карточку, а не весь профиль.
    getRewardsMe().catch(() => null),
  ]);
  if (!user) redirectToLogin("/profile");
  const plan: PricingPlan = fetchedPlan ?? {
    ...DEFAULT_PLAN,
    id: "vedamatch-basic",
    name: "VedaMatch",
    period: "month",
    mode: "business",
  };

  return (
    <div className="relative min-h-dvh bg-bg-0">
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
                alt={user.displayName}
                className="h-16 w-16 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-glass text-2xl font-semibold text-text-0">
                {user.displayName.charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-lg font-semibold text-text-0">
                {user.displayName}
              </p>
              {/* Мирское имя показываем второй строкой только владельцу: в
                  карточке оно уже перекрыто духовным. */}
              {user.spiritualName && (
                <p className="text-sm text-text-1">{user.name}</p>
              )}
              {user.statusLine && (
                <p className="text-sm text-cyan">{user.statusLine}</p>
              )}
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
          <InstallButton className="mt-3" />
          <LogoutButton variant="danger" className="mt-3 w-full py-3">
            Выйти из аккаунта
          </LogoutButton>
          <DeleteAccountSection
            className="mt-3"
            pendingDeletionAt={user.pendingDeletionAt}
            deletionEligibleAt={user.deletionEligibleAt}
          />
        </div>
        <SubscriptionCard subscription={user.subscription} plan={plan} />
        {/* Сразу после подписки: баллы тратятся именно на неё. */}
        <RewardsProfileCard data={rewards} />
        <div className="mb-6">
          <NotificationSettings />
        </div>
        <div className="mb-6">
          <CommunityPicker />
        </div>
        <ProfileEditor user={user} />
      </main>
    </div>
  );
}

/** Подписка и вход в поддержку: оба вопроса пользователи ищут в профиле. */
function SubscriptionCard({
  subscription,
  plan,
}: {
  subscription: SubscriptionState;
  plan: PricingPlan;
}) {
  const accent =
    subscription.status === "expired"
      ? "border-red-400/30"
      : subscription.status === "trial"
        ? "border-cyan/30"
        : "border-glass-brd";

  return (
    <div className={`glass mb-6 rounded-2xl border p-6 ${accent}`}>
      <h2 className="mb-4 font-display text-lg font-semibold text-text-0">
        Подписка
      </h2>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-text-2">Статус</dt>
          <dd className="font-medium text-text-0">
            {subscriptionStatusLabels[subscription.status]}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-2">Тариф</dt>
          <dd className="font-medium text-text-0">
            {plan.mode === "beta" ? (
              <>
                <span className="text-text-2 line-through">{plan.priceRub} ₽</span>{" "}
                Бесплатно (бета)
              </>
            ) : (
              `${plan.priceRub} ₽ / мес · ${plan.priceUsdt} USDT`
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-2">
            {subscription.status === "trial" ? "Пробный период до" : "Доступ до"}
          </dt>
          <dd className="font-medium text-text-0">
            {subscription.accessUntil
              ? `${formatDate(subscription.accessUntil)} (осталось дней: ${subscription.daysLeft})`
              : "Доступ закончился"}
          </dd>
        </div>
        {subscription.note && (
          <div className="flex justify-between gap-4">
            <dt className="text-text-2">Комментарий</dt>
            <dd className="text-right text-text-1">{subscription.note}</dd>
          </div>
        )}
      </dl>

      <p className="mt-4 text-sm text-text-1">
        {subscription.status === "expired"
          ? "Чтобы продлить доступ, напишите в поддержку — подскажем реквизиты для оплаты в рублях или USDT."
          : "Оплата продлевается через поддержку: рубли или USDT на выбор."}
      </p>

      <Link
        href="/support"
        className="mt-4 block rounded-xl border border-glass-brd px-4 py-3 text-center text-sm font-medium text-text-1 transition hover:text-text-0"
      >
        Связь с поддержкой
      </Link>
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
