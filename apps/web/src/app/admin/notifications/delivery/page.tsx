import { redirect } from "next/navigation";
import { NotificationDeliveryView } from "@/components/admin/notification-delivery-view";
import { getAdminNotificationDelivery } from "@/lib/api";
import { requireUser } from "@/lib/require-user";

export const metadata = {
  title: "Доставка уведомлений",
  robots: { index: false, follow: false },
};

/**
 * Живость точек доставки (VED-314). Раньше узнать, есть ли у человека куда
 * доставлять уведомления, можно было только запросом в базу прода по ssh — а в
 * логах при этом стояло бодрое «доставлено 6 из 6».
 */
export default async function AdminNotificationDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await requireUser();
  // Портальный раздел: доставка касается всех сервисов сразу.
  if (user.role !== "admin") redirect("/");

  const { days } = await searchParams;
  const report = await getAdminNotificationDelivery(days).catch(() => null);

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
        Доставка уведомлений
      </h1>
      <p className="mb-6 mt-1 text-sm text-text-1">
        Где у людей живые точки доставки и кому уведомления шли впустую.
      </p>

      <NotificationDeliveryView report={report} />
    </>
  );
}
