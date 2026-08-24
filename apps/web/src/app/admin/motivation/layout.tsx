import { redirect } from "next/navigation";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { redirectToLogin } from "@/lib/require-user";
import { getProfile } from "@/lib/api";

/**
 * Оболочка админки Motivation: право на сервис и заголовок раздела. Шапка,
 * сайдбар и отступы приходят из общего layout админки — здесь только то, что
 * общее у всех вкладок сервиса.
 */
export default async function AdminMotivationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/motivation");
  if (!canOpenAdminSection(user, "motivation")) redirect("/");

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
        Управление Вдохновением
      </h1>
      {children}
    </>
  );
}
