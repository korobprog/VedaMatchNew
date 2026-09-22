import { needsLineageChoice } from "@vedamatch/shared";
import { cookies, headers } from "next/headers";
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
import { FeaturedServices } from "@/components/featured-services";
import { FeaturedServicesEditor } from "@/components/featured-services-editor";
import {
  HOME_FEATURED_COOKIE,
  homeFeaturedOptions,
  parseHomeFeatured,
  resolveHomeFeatured,
} from "@/lib/home-featured";
import { MemberCountLine } from "@/components/member-count-line";
import { PortalNews } from "@/components/portal-news";
import { BlogHomeWidget } from "@/components/blog/blog-home-widget";
import { BlogFeedToggle } from "@/components/blog/blog-feed-toggle";
import {
  BLOG_HOME_COOKIE,
  resolveBlogHomeVisible,
} from "@/lib/blog-home-visibility";
import { getBlogHomeFeed } from "@/lib/blog-api";
import { InviteFriendTeaser } from "@/components/rewards/invite-friend-teaser";
import {
  getUnionChats,
  getUnionConnectionCounts,
  getUnionProfileState,
  getUnionRecommendations,
} from "@/lib/union-api";
import { buildUnionQuickAccessData } from "@/lib/union-quick-access";
import { needsWelcome, welcomeHref } from "@/lib/welcome";
import {
  advisorLimitFor,
  showsInstallPrompts,
  showsInviteTeaser,
} from "@/lib/onboarding-pacing";
import {
  getMusicPlaybackStateServer,
  getMusicTrack,
  getMyMusicFavorites,
} from "@/lib/music-api";
import { buildMusicQuickAccess } from "@/lib/music-quick-access";
import { buildMotivationQuickAccess } from "@/lib/motivation-quick-access";
import { buildLibraryQuickAccess } from "@/lib/library-quick-access";
import { buildAstroQuickAccess } from "@/lib/astro-quick-access";
import { AstroQuickAccessWidget } from "@/components/astro/astro-quick-access-widget";
import { getLibraryFeed } from "@/lib/library-api";
import { LibraryQuickAccessWidget } from "@/components/library/library-quick-access-widget";
import {
  getMotivationCategories,
  getMotivationFeed,
} from "@/lib/motivation-api";
import { loadWidgetFeed } from "@/lib/motivation-widget-feed";
import { MotivationQuickAccessWidget } from "@/components/motivation/motivation-quick-access-widget";
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
import { getAppManifest } from "@/lib/app-download-api";
import { isComContourHost } from "@/lib/app-download-contour";
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
    motivationFeed,
    libraryFeed,
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
    // Цитата в карточке «Вдохновения» — из «Философии» вперемешку (VED-79):
    // главную видят все, и афоризм здесь должен читаться без подготовки. Нет
    // такой папки или она пуста — личная лента, как раньше.
    loadWidgetFeed({
      categories: () => getMotivationCategories(),
      feed: (category) =>
        category
          ? getMotivationFeed("all", undefined, "random", category)
          : getMotivationFeed(),
    }).catch(() => null),
    // Свежий материал в карточке «Образования». Лента уже персональная:
    // линия и язык применяются на сервере.
    getLibraryFeed({ sort: "new" }).catch(() => null),
  ]);
  if (!user || !services) {
    // Маркер сессии без access-cookie: человек уже входил, refresh скорее всего
    // жив — не мигаем лендингом, показываем splash с тихим обновлением.
    if (!user && (await needsSessionRestore())) {
      return <SessionRestore returnTo={returnTo} />;
    }
    // Манифест приложения — только для гостя: карточка загрузки есть лишь
    // на лендинге, портал вошедшего её не показывает.
    const [appManifest, host] = await Promise.all([
      getAppManifest().catch(() => null),
      headers().then((h) => h.get("host")),
    ]);
    return (
      <LandingPage
        returnTo={returnTo}
        plan={plan ?? undefined}
        totalMembers={communityStats?.totalMembers}
        totalCities={communityStats?.totalCities}
        totalCommunities={communityStats?.totalCommunities}
        appManifest={appManifest}
        showTelegram={isComContourHost(host)}
      />
    );
  }
  // Новичок идёт в мастер: там тот же вопрос об этапе, но после имени
  // и города и с прогрессом. Страница анкеты остаётся для повторного
  // прохождения, её не редирект открывает, а ссылка из профиля.
  // Путь возврата едет в мастер: человек, пришедший по ссылке (например на
  // конференцию), обязан оказаться там, куда шёл, а не на главной.
  if (needsWelcome(user)) redirect(welcomeHref(returnTo));

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

  // Подсказки новичку раскрываются по одной, а не падают все разом, см.
  // `advisorLimitFor`. Дальше первых суток это обычная выдача советника.
  const now = new Date();
  const advisorCards = buildAdvisorCards(
    toAdvisorInput(
      {
        hasHomeLocation: Boolean(user.homeLocation),
        needsLineage: needsLineageChoice(user),
        unionProfile,
        unionCounts,
        astroState,
        astroToday,
        myNotices,
        myResponses,
        myCommunities,
      },
      now,
    ),
    advisorLimitFor(user.createdAt, now),
  );

  // Три крупные кнопки над сеткой — свои у каждого (VED-86). Сервис,
  // вынесенный наверх, из сетки уходит: второй раз в списке он просто шум.
  const featuredOptions = homeFeaturedOptions(services);
  const featured = resolveHomeFeatured(
    parseHomeFeatured((await cookies()).get(HOME_FEATURED_COOKIE)?.value, user.id),
    featuredOptions,
  );
  const featuredRoutes = new Set(featured.map((item) => item.href));
  // Блог-лента наверху главной (VED-238). Выбор «убрать ленту с экрана»
  // живёт в cookie и читается здесь, на сервере: лента рисуется в SSR, и
  // решение, известное только браузеру, дало бы главную, которая сначала
  // показывает ленту, а потом её убирает.
  const blogVisible = resolveBlogHomeVisible(
    (await cookies()).get(BLOG_HOME_COOKIE)?.value,
    user.id,
  );
  // Упавший сервис обязан убрать ленту, а не главную.
  const blogFeed = blogVisible ? await getBlogHomeFeed().catch(() => null) : null;
  const unionService = services.find((s) => s.url === "/union");
  const motivationService = services.find((s) => s.url === "/motivation");
  const motivationQuickAccess = buildMotivationQuickAccess(motivationFeed);
  const libraryService = services.find((s) => s.url === "/library");
  const libraryQuickAccess = buildLibraryQuickAccess(libraryFeed, now);
  // Ответ «сегодня» главная уже получает для советника; карточка берёт из
  // него факты (Луна, даша), советник — фразу. Дублей нет.
  const astroService = services.find((s) => s.url === "/astro");
  const astroQuickAccess = buildAstroQuickAccess(astroToday);
  // Считаем сообщения, а не беседы: значок читается как «столько меня ждёт»,
  // и три письма из одного диалога — это три письма. Запросы на переписку в
  // том же числе: человеку важно, что его ждут, а не в какой это очереди.
  //
  // Число живёт только на крупной кнопке «Общения». На плитке сервиса в сетке
  // его нет намеренно: два одинаковых счётчика на одном экране человек
  // начинает сверять между собой вместо того, чтобы открыть переписку.
  const chatBadge = (chatUnread?.messages ?? 0) + (chatUnread?.requests ?? 0);
  const installPromptsReady = showsInstallPrompts(user.createdAt, now);
  const serviceExtras = {
    ...(unionService
      ? {
          [unionService.id]: {
            badgeCount: unionCounts?.incomingPending,
            extra: <UnionQuickAccessWidget {...unionQuickAccess} />,
          },
        }
      : {}),
    ...(motivationService && motivationQuickAccess.quote
      ? {
          [motivationService.id]: {
            extra: <MotivationQuickAccessWidget {...motivationQuickAccess} />,
          },
        }
      : {}),
    ...(libraryService && libraryQuickAccess.latest
      ? {
          [libraryService.id]: {
            extra: <LibraryQuickAccessWidget {...libraryQuickAccess} />,
          },
        }
      : {}),
    ...(astroService && astroQuickAccess.moonLine
      ? {
          [astroService.id]: {
            extra: <AstroQuickAccessWidget {...astroQuickAccess} />,
          },
        }
      : {}),
  };
  // Сервис с живой карточкой в сетке (Знакомства, Вдохновение…) остаётся в
  // ней и после выноса наверх: кнопка только ведёт в сервис, а карточка несёт
  // то, чего у кнопки нет, — цитату дня, новые анкеты. Иначе вынос наверх
  // отнимал бы виджет.
  const gridServices = services.filter(
    (service) =>
      !featuredRoutes.has(service.url) || service.id in serviceExtras,
  );

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        {/* Блог-лента (VED-238) — на месте карточки поддержки и строки
            поиска: оба уехали в панель горячих кнопок и с главной убраны.
            Поддержка там же — плиткой «Написать админам», и вдобавок в меню
            шапки, профиле и подвале; поиск — плиткой «Поиск» на ту же
            страницу `/search`, где поле осталось над выдачей. Место, которое
            они занимали, — это место ленты. */}
        {blogFeed && (
          <BlogHomeWidget data={blogFeed} userId={user.id} className="mb-6" />
        )}
        {/* Новости администрации выше советника: советник говорит о делах
            человека, новость — о портале, и она не должна теряться под ними. */}
        <PortalNews items={news ?? []} />
        {/* Приглашение стоит рядом с новостями и выше советника: советник
            говорит о делах человека, а это — предложение портала, как и
            новость. Ниже сетки сервисов его никто не находил. */}
        {showsInviteTeaser(user.createdAt, now) && (
          <InviteFriendTeaser userId={user.id} />
        )}
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
        <FeaturedServices items={featured} unread={chatBadge} />
        {/* Сразу под ходовыми сервисами, как в макете Main.dc.html: карточка
            возвращает к недослушанному, не заходя в Музыку. Её нет вовсе,
            когда возвращаться не к чему и избранное пусто. */}
        {musicQuickAccess && <MusicFriendsBridge data={musicQuickAccess} />}
        <ServiceGrid
          services={gridServices}
          userId={user.id}
          extras={serviceExtras}
          /* «Настроить кнопки» — в строке над сеткой, рядом с «Изменить
             порядок» и видом плиток (VED-111). Под тремя кнопками она
             висела отдельной строкой, а плеер между ними отрывал её от
             остальных настроек главной. */
          toolbarStart={
            <>
              <FeaturedServicesEditor
                userId={user.id}
                current={featured.map((item) => item.key)}
                options={featuredOptions.map(({ key, name }) => ({
                  key,
                  name,
                }))}
              />
              {/* Возврат спрятанной ленты — здесь, а не наверху: в
                  спрятанном виде верх главной обязан выглядеть как раньше.
                  Пока лента показана, кнопки нет вовсе. */}
              <BlogFeedToggle userId={user.id} hidden={!blogVisible} />
            </>
          }
        />
        {/* Подвал главной, под сеткой: действия людей, которые открыли
            доступ к себе (мэтч в Знакомствах, раскрытые контакты в
            Справочнике). Своего блока в разметке не занимает, если открытых
            доступов нет — виджет тогда не рендерится вовсе. */}
        <FriendsActivityWidget initialFeed={activityFeed ?? { friends: [] }} />
      </main>
      {/* Баннер установки и просьба об уведомлениях — самые навязчивые из
          подсказок, поэтому их черёд последний. */}
      {installPromptsReady && <InstallBanner />}
      {/* Главная лежит вне группы (portal), где висит тот же маячок, — без
          этой строки самая посещаемая страница в замер не попадает. */}
      <InstallEnvironmentBeacon />
      {installPromptsReady && <NotificationPermissionPrompt />}
      <PushSubscriptionSync />
    </div>
  );
}
