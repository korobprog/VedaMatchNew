import { redirect } from "next/navigation";
import { getProfile, getServices } from "@/lib/api";
import { Header } from "@/components/header";
import { ServiceCard } from "@/components/service-card";
import { getUnionConnectionCounts } from "@/lib/union-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export default async function Home() {
  const [user, services, unionCounts] = await Promise.all([
    getProfile(),
    getServices(),
    getUnionConnectionCounts().catch(() => null),
  ]);
  if (!user || !services) redirect("/login");
  if (!user.spiritualStage) redirect("/self-identification");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <section className="mb-10">
          <h1 className="mb-2 font-display text-2xl font-bold text-text-0 sm:text-3xl">
            Добро пожаловать в VedaMatch
          </h1>
          <p className="text-text-1">
            Один аккаунт — один вход — доступ ко всем сервисам VedaMatch.
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
            />
          ))}
        </section>
      </main>
    </div>
  );
}
