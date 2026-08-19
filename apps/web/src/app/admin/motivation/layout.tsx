import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { getProfile } from "@/lib/api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

/**
 * Общая оболочка админки Motivation: проверка роли и шапка живут здесь, чтобы
 * каждая вкладка грузила только свои данные.
 */
export default async function AdminMotivationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/motivation");
  if (user.role !== "admin" && user.role !== "service-admin") redirect("/");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:py-8">
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Управление motivation
        </h1>
        {children}
      </main>
    </div>
  );
}
