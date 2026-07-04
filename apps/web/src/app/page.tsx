import { redirect } from "next/navigation";
import { getProfile, getServices } from "@/lib/api";
import { Header } from "@/components/header";
import { ServiceCard } from "@/components/service-card";

export default async function Home() {
  const [user, services] = await Promise.all([getProfile(), getServices()]);
  if (!user || !services) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="mb-10">
          <h1 className="mb-2 text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Добро пожаловать в VedaMatch
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Один аккаунт — один вход — доступ ко всем сервисам VedaMatch.
          </p>
        </section>
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </section>
      </main>
    </div>
  );
}
