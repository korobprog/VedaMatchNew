import { redirect } from "next/navigation";
import {
  getBillingPlan,
  getCommunityStats,
  getMyAnnouncements,
  getProfile,
  getServices,
} from "@/lib/api";
import { Header } from "@/components/header";
import { ServiceGrid } from "@/components/service-grid";
import {
  FEATURED_ROUTES,
  FeaturedServices,
} from "@/components/featured-services";
import { MemberCountLine } from "@/components/member-count-line";
import { PortalNews } from "@/components/portal-news";
import { InviteFriendTeaser } from "@/components/rewards/invite-friend-teaser";
import {
  getUnionChats,
  getUnionConnectionCounts,
  getUnionProfileState,
  getUnionRecommendations,
} from "@/lib/union-api";
import { buildUnionQuickAccessData } from "@/lib/union-quick-access";
import {
  getMusicPlaybackStateServer,
  getMusicTrack,
  getMyMusicFavorites,
} from "@/lib/music-api";
import { buildMusicQuickAccess } from "@/lib/music-quick-access";
import { MusicFriendsBridge } from "@/components/activity/music-friends-bridge";
import { getAstroState, getAstroToday } from "@/lib/astro-api";
import { getChatUnread } from "@/lib/chat-api";
import {
  getMyNoticeResponsesServer,
  getMyNoticesForAdvisor,
} from "@/lib/notices-server-api";
import { getMyCommunitiesServer } from "@/lib/communities-server-api";
import { buildAdvisorCards } from "@/lib/advisor/advisor-cards";
import { toAdvisorInput } from "@/lib/advisor/advisor-signals";
import { AdvisorStrip } from "@/components/advisor/advisor-strip";
import { UnionQuickAccessWidget } from "@/components/union/union-quick-access-widget";
import { FriendsActivityWidget } from "@/components/activity/friends-activity-widget";
import { getActivityFeedServer } from "@/lib/activity-server-api";
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
    chatUnread,
    activityFeed,
    musicPlayback,
    musicFavorites,
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
    getMyAnnouncements("ru").catch(() => null),
    getChatUnread().catch(() => null),
    getActivityFeedServer().catch(() => null),
    getMusicPlaybackStateServer().catch(() => null),
    getMyMusicFavorites().catch(() => null),
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
  // Новичок идёт в мастер: там тот же вопрос об этапе, но после имени
  // и города и с прогрессом. Страница анкеты остаётся для повторного
  // прохождения, её не редирект открывает, а ссылка из профиля.
  if (!user.spiritualStage) redirect("/welcome");

  // Карточка Музыки. Запись догружается вторым запросом: состояние плеера
  // несёт только идентификатор, а карточке нужны название, обложка и
  // длительность. Запрос идёт, лишь когда есть что продолжать, и падение
  // Музыки обязано убрать одну карточку, а не главную портала.
  const musicTrack = musicPlayback?.trackId
    ? await getMusicTrack(musicPlayback.trackId).catch(() => null)
    : null;
  const musicQuickAccess = buildMusicQuickAccess({
    state: musicPlayback,
    track: musicTrack,
    favoritesCount: musicFavorites?.items.length ?? 0,
  });

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

  // «Общение» уже стоит крупной кнопкой выше — в сетке ему делать нечего.
  const gridServices = services.filter(
    (service) => !FEATURED_ROUTES.includes(service.url),
  );
  const unionService = services.find((s) => s.url === "/union");
  // Считаем сообщения, а не беседы: значок читается как «столько меня ждёт»,
  // и три письма из одного диалога — это три письма. Запросы на переписку в
  // том же числе: человеку важно, что его ждут, а не в какой это очереди.
  //
  // Число живёт только на крупной кнопке «Общения». На плитке сервиса в сетке
  // его нет намеренно: два одинаковых счётчика на одном экране человек
  // начинает сверять между собой вместо того, чтобы открыть переписку.
  const chatBadge = (chatUnread?.messages ?? 0) + (chatUnread?.requests ?? 0);
  const serviceExtras = {
    ...(unionService
      ? {
          [unionService.id]: {
            badgeCount: unionCounts?.incomingPending,
            extra: <UnionQuickAccessWidget {...unionQuickAccess} />,
          },
        }
      : {}),
  };

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        {/* Новости администрации выше советника: советник говорит о делах
            человека, новость — о портале, и она не должна теряться под ними. */}
        <PortalNews items={news ?? []} />
        {/* Приглашение стоит рядом с новостями и выше советника: советник
            говорит о делах человека, а это — предложение портала, как и
            новость. Ниже сетки сервисов его никто не находил. */}
        <InviteFriendTeaser userId={user.id} />
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
        {/* Ходовые сервисы отдельной строкой над сеткой: за ними заходят
            чаще всего, и искать их среди равных плиток не нужно. */}
        <FeaturedServices unread={chatBadge} />
        {/* Сразу под ходовыми сервисами, как в макете Main.dc.html: карточка
            возвращает к недослушанному, не заходя в Музыку. Её нет вовсе,
            когда возвращаться не к чему и избранное пусто. */}
        {musicQuickAccess && <MusicFriendsBridge data={musicQuickAccess} />}
        <ServiceGrid
          services={gridServices}
          userId={user.id}
          extras={serviceExtras}
        />
        {/* Подвал главной, под сеткой: действия людей, которые открыли
            доступ к себе (мэтч в Знакомствах, раскрытые контакты в
            Справочнике). Своего блока в разметке не занимает, если открытых
            доступов нет — виджет тогда не рендерится вовсе. */}
        <FriendsActivityWidget initialFeed={activityFeed ?? { friends: [] }} />
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
