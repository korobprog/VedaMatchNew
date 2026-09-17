import Link from "next/link";
import { redirect } from "next/navigation";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { redirectToLogin } from "@/lib/require-user";
import { AdminNoticeReportsView } from "@/components/notices/admin-notice-reports-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Жалобы на объявления",
  robots: { index: false, follow: false },
};

export default async function AdminNoticesPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/notices");
  if (!canOpenAdminSection(user, "notices")) redirect("/");

  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Жалобы на объявления
      </h1>
      <p className="mb-2 text-sm text-text-1">
        Три открытые жалобы скрывают объявление автоматически. «Вернуть в
        ленту» снимает и скрытие, и метку автопроверки.
      </p>
      {/* VED-42: удаление чужого объявления пишется в общий журнал
          администрации, а не сюда — ссылкой, а не дублирующим списком. */}
      <Link
        href="/admin/audit?action=notices.notice-deleted"
        className="mb-6 inline-block text-sm font-medium text-text-1 underline underline-offset-4 hover:text-magenta"
      >
        Журнал удалений объявлений →
      </Link>
      <AdminNoticeReportsView />
    </>
  );
}
