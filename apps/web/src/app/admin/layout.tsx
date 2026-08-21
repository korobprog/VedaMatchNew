import { redirect } from "next/navigation";
import { isPortalAdmin } from "@vedamatch/shared";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Header } from "@/components/header";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { visibleAdminNav } from "@/lib/admin-nav";
import { requireUser } from "@/lib/require-user";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Оболочка всей админки: шапка, навигация и общий отступ живут здесь, страницы
 * отдают только содержимое. Layout режет доступ по «админ хоть чего-нибудь»,
 * а право на конкретный раздел проверяет сама страница — иначе администратор
 * сервиса видел бы в сайдбаре чужие разделы и получал редирект по клику.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!isPortalAdmin(user)) redirect("/");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 pb-24 lg:flex-row lg:py-8">
        <AdminSidebar groups={visibleAdminNav(user)} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
