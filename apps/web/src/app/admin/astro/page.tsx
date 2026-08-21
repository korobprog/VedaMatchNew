import { redirect } from "next/navigation";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { redirectToLogin } from "@/lib/require-user";
import { getProfile } from "@/lib/api";
import { getAdminAstroSettings, getAdminAstroUsage } from "@/lib/astro-api";
import { AdminAstroForm } from "@/components/astro/admin-astro-form";

export const metadata = {
  title: "Астрология — расход и лимиты",
  robots: { index: false, follow: false },
};

export default async function AdminAstroPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/astro");
  if (!canOpenAdminSection(user, "astro")) redirect("/");

  const [settings, usage] = await Promise.all([
    getAdminAstroSettings(),
    getAdminAstroUsage(30),
  ]);
  if (!settings || !usage) {
    throw new Error("Не удалось загрузить настройки астрологии");
  }

  return (
    <>
      <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
        Астрология: расход и лимиты
      </h1>
      <p className="mb-6 text-text-1">
        Расчёт карты бесплатен и лимитами не ограничен — платить приходится
        только за тексты разборов. Настройки применяются сразу, без передеплоя.
      </p>
      <AdminAstroForm initialSettings={settings} usage={usage} />
    </>
  );
}
