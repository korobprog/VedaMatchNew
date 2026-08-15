import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { NotificationList } from "@/components/notifications/notification-list";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Уведомления — VedaMatch",
  description: "Непрочитанные уведомления портала.",
  // Личная лента: в поисковиках ей делать нечего.
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <h1 className="mb-1 font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Уведомления
        </h1>
        <p className="mb-6 text-sm text-text-1">
          Непрочитанное. После просмотра список очищается сам.
        </p>

        <NotificationList />
      </main>
    </div>
  );
}
