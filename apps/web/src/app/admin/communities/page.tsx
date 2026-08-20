import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { AdminCommunitiesView } from "@/components/communities/admin-communities-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Заявки на общины",
  robots: { index: false, follow: false },
};

export default async function AdminCommunitiesPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/communities");
  if (user.role !== "admin" && user.role !== "service-admin") redirect("/");

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 pb-28">
        <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
          Заявки на общины
        </h1>
        <p className="mb-6 text-sm text-text-1">
          Одобряйте, только убедившись, что такой общины ещё нет в справочнике:
          дубли — главная беда каталога ятр. Знак проверки ставьте, когда
          уверены, что община настоящая.
        </p>
        <AdminCommunitiesView />
      </main>
    </div>
  );
}
