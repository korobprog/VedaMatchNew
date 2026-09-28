import { Header } from "@/components/header";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { RewardsHistory } from "@/components/rewards/rewards-history";
import { RewardsInviteCard } from "@/components/rewards/rewards-invite-card";
import { RewardsInviteMessage } from "@/components/rewards/rewards-invite-message";
import { RewardsReferralList } from "@/components/rewards/rewards-referral-list";
import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";
import {
  getRewardsLedger,
  getRewardsMe,
  getRewardsReferrals,
} from "@/lib/rewards-api";

export const metadata = {
  title: "Баллы и приглашения",
};

export default async function RewardsPage() {
  const [user, me, referrals, ledger] = await Promise.all([
    getProfile(),
    getRewardsMe(),
    getRewardsReferrals(),
    getRewardsLedger(),
  ]);
  if (!user) redirectToLogin("/rewards");
  if (!me) throw new Error("Не удалось загрузить баллы");

  // Текст приглашения тот же, что у горячей кнопки «Пригласить» (VED-618):
  // шаблон правит администратор, личную ссылку в него ставит сервер.
  const inviteMessage = me.inviteMessage;

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
          Баллы и приглашения
        </h1>
        <p className="mb-6 max-w-prose font-body text-sm text-text-1">
          Приведите друга: он получит приветственные баллы сразу, а вы — когда
          он освоится на портале. За приглашённых вашими друзьями баллы тоже
          идут, но меньше.
        </p>
        <RewardsInviteCard data={me} />
        <RewardsInviteMessage message={inviteMessage} />
        <RewardsReferralList items={referrals ?? []} />
        <RewardsHistory items={ledger?.items ?? []} />
      </main>
    </div>
  );
}
