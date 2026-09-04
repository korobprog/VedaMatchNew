import { redirect } from "next/navigation";
import { AdminAuthProvidersView } from "@/components/admin/admin-auth-providers-view";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";

export const metadata = {
  title: "Вход",
  robots: { index: false, follow: false },
};

export default async function AdminAuthPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/auth");
  if (!canOpenAdminSection(user, "auth")) redirect("/");

  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">Вход</h1>
      <p className="mb-6 text-sm text-text-1">
        Способы входа на портал. Выключенный способ не просто прячет кнопку — он
        отказывает и по прямой ссылке. Домены задают, на каком сайте способ
        показывать; порядок — как кнопки идут на экране входа.
      </p>
      <AdminAuthProvidersView />
    </>
  );
}
