import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { AdminNoticeReportsView } from "@/components/notices/admin-notice-reports-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Жалобы на объявления",
  robots: { index: false, follow: false },
};

export default async function AdminNoticesPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/notices");
  if (user.role !== "admin" && user.role !== "service-admin") redirect("/");

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 pb-28">
        <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
          Жалобы на объявления
        </h1>
        <p className="mb-6 text-sm text-text-1">
          Три открытые жалобы скрывают объявление автоматически. «Вернуть в
          ленту» снимает и скрытие, и метку автопроверки.
        </p>
        <AdminNoticeReportsView />
      </main>
    </div>
  );
}
