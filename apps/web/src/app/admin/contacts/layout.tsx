import { redirect } from "next/navigation";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";

/**
 * Оболочка админки справочника: право на сервис и заголовок раздела. Шапка и
 * сайдбар приходят из общего layout админки.
 */
export default async function AdminContactsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/contacts");
  if (!canOpenAdminSection(user, "contacts")) redirect("/");

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
        Управление справочником
      </h1>
      {children}
    </>
  );
}
