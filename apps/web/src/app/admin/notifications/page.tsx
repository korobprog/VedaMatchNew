import { redirect } from "next/navigation";
import { BroadcastComposer } from "@/components/admin/broadcast-composer";
import { BroadcastList } from "@/components/admin/broadcast-list";
import { getAdminBroadcasts } from "@/lib/api";
import { requireUser } from "@/lib/require-user";

export const metadata = {
  title: "Рассылки",
  robots: { index: false, follow: false },
};

export default async function AdminNotificationsPage() {
  const user = await requireUser();
  // Портальный раздел: администратор сервиса не пишет всему порталу от лица
  // платформы, поэтому здесь только роль admin.
  if (user.role !== "admin") redirect("/");

  const broadcasts = await getAdminBroadcasts();

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
        Рассылки
      </h1>
      <p className="mb-6 mt-1 text-sm text-text-1">
        Объявления администрации: колокольчик всем из выборки, пуш — тем, кто
        разрешил уведомления. Отправка идёт пакетами в фоне, счётчики в списке
        обновляются по ходу.
      </p>

      <BroadcastComposer />

      <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
        История
      </h2>
      <BroadcastList broadcasts={broadcasts ?? []} />
    </>
  );
}
