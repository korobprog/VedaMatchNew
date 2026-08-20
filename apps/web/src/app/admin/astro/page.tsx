import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { getProfile } from "@/lib/api";
import { getAdminAstroSettings, getAdminAstroUsage } from "@/lib/astro-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { AdminAstroForm } from "@/components/astro/admin-astro-form";

export const metadata = {
  title: "Астрология — расход и лимиты",
};

export default async function AdminAstroPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/astro");
  if (user.role !== "admin") redirect("/");

  const [settings, usage] = await Promise.all([
    getAdminAstroSettings(),
    getAdminAstroUsage(30),
  ]);
  if (!settings || !usage) {
    throw new Error("Не удалось загрузить настройки астрологии");
  }

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
          Астрология: расход и лимиты
        </h1>
        <p className="mb-6 text-text-1">
          Расчёт карты бесплатен и лимитами не ограничен — платить приходится
          только за тексты разборов. Настройки применяются сразу, без передеплоя.
        </p>
        <AdminAstroForm initialSettings={settings} usage={usage} />
      </main>
    </div>
  );
}
