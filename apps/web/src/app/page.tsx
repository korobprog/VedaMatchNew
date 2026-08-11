import { redirect } from "next/navigation";
import { getBillingPlan, getProfile, getServices } from "@/lib/api";
import { Header } from "@/components/header";
import { ServiceCard } from "@/components/service-card";
import {
  getUnionChats,
  getUnionConnectionCounts,
  getUnionProfileState,
  getUnionRecommendations,
} from "@/lib/union-api";
import { buildUnionQuickAccessData } from "@/lib/union-quick-access";
import { UnionQuickAccessWidget } from "@/components/union/union-quick-access-widget";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { LandingPage } from "@/components/landing";
import { InstallBanner } from "@/components/pwa/install-banner";
import { NotificationPermissionPrompt } from "@/components/pwa/notification-permission-prompt";

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
  ] = await Promise.all([
    getProfile(),
    getServices(),
    getUnionConnectionCounts().catch(() => null),
    getUnionChats().catch(() => null),
    getUnionProfileState().catch(() => null),
    getUnionRecommendations({ sort: "new", pageSize: "3" }).catch(() => null),
    getBillingPlan().catch(() => null),
  ]);
  if (!user || !services)
    return <LandingPage returnTo={returnTo} plan={plan ?? undefined} />;
  if (!user.spiritualStage) redirect("/self-identification");

  const unionQuickAccess = buildUnionQuickAccessData(
    unionChats,
    unionCounts,
    unionProfile,
    unionRecommendations,
  );

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <section className="mb-10">
          <h1 className="mb-2 flex flex-wrap items-center gap-3 font-display text-2xl font-bold text-text-0 sm:text-3xl">
            Добро пожаловать в VedaMatch
            <span className="inline-flex items-center rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_20px_rgba(255,62,158,0.5)] animate-pulse">
              Beta
            </span>
          </h1>
          <p className="text-text-1">
         {user.gender === 'female' ? 'Дорогая' : 'Дорогой'} {user.name}, Вы находитесь на Портале у вас доступ к этим сервисам:
          </p>
        </section>
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              badgeCount={
                service.url === "/union"
                  ? unionCounts?.incomingPending
                  : undefined
              }
              extra={
                service.url === "/union" ? (
                  <UnionQuickAccessWidget {...unionQuickAccess} />
                ) : undefined
              }
            />
          ))}
        </section>
      </main>
      <InstallBanner />
      <NotificationPermissionPrompt />
    </div>
  );
}
