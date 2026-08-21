import { redirect } from "next/navigation";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";

/**
 * Оболочка админки Рынка: право на сервис и заголовок раздела. Шапка и сайдбар
 * приходят из общего layout админки.
 */
export default async function AdminMarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/market");
  if (!canOpenAdminSection(user, "market")) redirect("/");

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
        Управление Рынком
      </h1>
      {children}
    </>
  );
}
