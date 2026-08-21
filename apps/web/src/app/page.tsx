import { redirect } from "next/navigation";
import {
  getAnnouncements,
  getBillingPlan,
  getCommunityStats,
  getProfile,
  getServices,
} from "@/lib/api";
import { Header } from "@/components/header";
import { ServiceGrid } from "@/components/service-grid";
import { MemberCountLine } from "@/components/member-count-line";
import { PortalNews } from "@/components/portal-news";
import {
  getUnionChats,
  getUnionConnectionCounts,
  getUnionProfileState,
  getUnionRecommendations,
} from "@/lib/union-api";
import { buildUnionQuickAccessData } from "@/lib/union-quick-access";
import { getAstroState, getAstroToday } from "@/lib/astro-api";
import {
  getMyNoticeResponsesServer,
  getMyNoticesForAdvisor,
} from "@/lib/notices-server-api";
import { getMyCommunitiesServer } from "@/lib/communities-server-api";
import { buildAdvisorCards } from "@/lib/advisor/advisor-cards";
import { toAdvisorInput } from "@/lib/advisor/advisor-signals";
import { AdvisorStrip } from "@/components/advisor/advisor-strip";
import { UnionQuickAccessWidget } from "@/components/union/union-quick-access-widget";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { LandingPage } from "@/components/landing";
import { SessionRestore } from "@/components/session-restore";
import { needsSessionRestore } from "@/lib/session-marker";
import { InstallBanner } from "@/components/pwa/install-banner";
import { InstallEnvironmentBeacon } from "@/components/pwa/install-environment-beacon";
import { NotificationPermissionPrompt } from "@/components/pwa/notification-permission-prompt";
import { PushSubscriptionSync } from "@/components/pwa/push-subscription-sync";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo: rawReturnTo } = await searchParams;
  const returnTo = Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo;
  const [
    user,
    services,
    unionCounts,
    unionChats,
    unionProfile,
    unionRecommendations,
    plan,
    communityStats,
    // Источники советника. Каждый в своём catch — упавший сервис обязан
    // убрать одну карточку, а не весь блок и тем более не главную.
    astroState,
    astroToday,
    myNotices,
    myResponses,
    myCommunities,
    news,
  ] = await Promise.all([
    getProfile(),
    getServices(),
    getUnionConnectionCounts().catch(() => null),
    getUnionChats().catch(() => null),
    getUnionProfileState().catch(() => null),
    getUnionRecommendations({ sort: "new", pageSize: "3" }).catch(() => null),
    getBillingPlan().catch(() => null),
    getCommunityStats().catch(() => null),
    getAstroState().catch(() => null),
    getAstroToday().catch(() => null),
    getMyNoticesForAdvisor().catch(() => null),
    getMyNoticeResponsesServer().catch(() => null),
    getMyCommunitiesServer().catch(() => null),
    // Новости портала — не повод ронять главную: не пришли, значит их нет.
    getAnnouncements("ru").catch(() => null),
  ]);
  if (!user || !services) {
    // Маркер сессии без access-cookie: человек уже входил, refresh скорее всего
    // жив — не мигаем лендингом, показываем splash с тихим обновлением.
    if (!user && (await needsSessionRestore())) {
      return <SessionRestore returnTo={returnTo} />;
    }
    return (
      <LandingPage
        returnTo={returnTo}
        plan={plan ?? undefined}
        totalMembers={communityStats?.totalMembers}
        totalCities={communityStats?.totalCities}
        totalCommunities={communityStats?.totalCommunities}
      />
    );
  }
  if (!user.spiritualStage) redirect("/self-identification");

  const unionQuickAccess = buildUnionQuickAccessData(
    unionChats,
    unionCounts,
    unionProfile,
    unionRecommendations,
  );

  const advisorCards = buildAdvisorCards(
    toAdvisorInput(
      {
        hasHomeLocation: Boolean(user.homeLocation),
        unionProfile,
        unionCounts,
        astroState,
        astroToday,
        myNotices,
        myResponses,
        myCommunities,
      },
      new Date(),
    ),
  );

  const unionService = services.find((s) => s.url === "/union");
  const serviceExtras = unionService
    ? {
        [unionService.id]: {
          badgeCount: unionCounts?.incomingPending,
          extra: <UnionQuickAccessWidget {...unionQuickAccess} />,
        },
      }
    : {};

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        {/* Новости администрации выше советника: советник говорит о делах
            человека, новость — о портале, и она не должна теряться под ними. */}
        <PortalNews items={news ?? []} />
        <AdvisorStrip
          cards={advisorCards}
          userId={user.id}
          displayName={user.displayName}
        />
        {communityStats && (
          // Здоровается кто-то один: советник обращается по имени в первой
          // карточке, и второе обращение в паре сантиметров обесценивало бы
          // имя. Когда советнику нечего сказать, приветствие берёт строка.
          <MemberCountLine
            userId={user.id}
            total={communityStats.totalMembers}
            greetName={
              advisorCards.length === 0 ? user.displayName : undefined
            }
          />
        )}
        <ServiceGrid services={services} userId={user.id} extras={serviceExtras} />
      </main>
      <InstallBanner />
      {/* Главная лежит вне группы (portal), где висит тот же маячок, — без
          этой строки самая посещаемая страница в замер не попадает. */}
      <InstallEnvironmentBeacon />
      <NotificationPermissionPrompt />
      <PushSubscriptionSync />
    </div>
  );
}
