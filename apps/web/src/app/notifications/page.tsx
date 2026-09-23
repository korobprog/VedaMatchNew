import Link from "next/link";
import { History } from "lucide-react";
import { Header } from "@/components/header";
import { redirectToLogin } from "@/lib/require-user";
import { NotificationList } from "@/components/notifications/notification-list";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Уведомления",
  description: "Непрочитанные уведомления портала.",
  // Личная лента: в поисковиках ей делать нечего.
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/notifications");

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
            Уведомления
          </h1>
          {/* История уведомлений (VED-404) — тем же значком, что «История»
              переходов на панели быстрых кнопок (VED-392): заказчик просил
              «по типу истории навигации, такой же значок». Подпись видна, а
              полное имя для скринридера её содержит — голосовая команда
              «нажми История» находит кнопку. */}
          <Link
            href="/notifications/history"
            aria-label="История уведомлений"
            title="История уведомлений"
            className="glass inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-glass-brd px-4 text-sm font-medium text-text-1 transition-colors hover:border-magenta/40 hover:text-text-0"
          >
            <History className="h-[18px] w-[18px]" aria-hidden="true" />
            История
          </Link>
        </div>
        <p className="mb-6 text-sm text-text-1">
          Новое сверху. Прочитанное остаётся неделю после последнего открытия и
          удаляется само.
        </p>

        <NotificationList />
      </main>
    </div>
  );
}
