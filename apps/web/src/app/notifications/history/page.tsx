import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { redirectToLogin } from "@/lib/require-user";
import { NotificationHistory } from "@/components/notifications/notification-history";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "История уведомлений",
  description: "Прочитанные уведомления в порядке последнего контакта.",
  // Личная лента: в поисковиках ей делать нечего.
  robots: { index: false, follow: false },
};

/** История уведомлений (VED-404): см. `NotificationHistory`. */
export default async function NotificationHistoryPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/notifications/history");

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <Link
          href="/notifications"
          className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm text-text-1 transition-colors hover:text-text-0"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Уведомления
        </Link>
        <h1 className="mb-1 font-display text-2xl font-bold text-text-0 sm:text-3xl">
          История уведомлений
        </h1>
        <p className="mb-6 text-sm text-text-1">
          Прочитанное — сверху то, что вы открывали или отмечали последним.
          Хранится неделю после последнего открытия.
        </p>

        <NotificationHistory />
      </main>
    </div>
  );
}
