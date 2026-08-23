import { Header } from "@/components/header";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { RewardsHistory } from "@/components/rewards/rewards-history";
import { RewardsInviteCard } from "@/components/rewards/rewards-invite-card";
import { RewardsInviteMessage } from "@/components/rewards/rewards-invite-message";
import { RewardsReferralList } from "@/components/rewards/rewards-referral-list";
import { getProfile, getServices } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";
import { getServiceContent } from "@/lib/service-content";
import { buildInviteMessage, type InviteService } from "@/lib/rewards-share";
import {
  getRewardsLedger,
  getRewardsMe,
  getRewardsReferrals,
} from "@/lib/rewards-api";

export const metadata = {
  title: "Баллы и приглашения",
};

export default async function RewardsPage() {
  const [user, me, referrals, ledger, services] = await Promise.all([
    getProfile(),
    getRewardsMe(),
    getRewardsReferrals(),
    getRewardsLedger(),
    // Каталог для текста приглашения: упавший — это список без сервисов,
    // а не страница без баллов.
    getServices().catch(() => null),
  ]);
  if (!user) redirectToLogin("/rewards");
  if (!me) throw new Error("Не удалось загрузить баллы");

  // Имя берём из каталога — его правят в админке; короткую суть из
  // service-content.ts, где живёт маркетинговый копирайт. Сервисы без
  // готовой строки в приглашение не попадают: строчка «Название — » хуже,
  // чем отсутствие строчки.
  const inviteServices: InviteService[] = (services ?? [])
    .filter((service) => service.status === "active")
    .map((service) => ({
      name: service.name,
      tagline: getServiceContent(service.slug)?.tagline ?? "",
    }))
    .filter((service) => service.tagline.length > 0);

  const inviteMessage = buildInviteMessage({
    link: me.link,
    services: inviteServices,
    welcomePoints: me.welcomePoints,
  });

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
        <RewardsInviteMessage
          message={inviteMessage}
          services={inviteServices}
        />
        <RewardsReferralList items={referrals ?? []} />
        <RewardsHistory items={ledger?.items ?? []} />
      </main>
    </div>
  );
}
