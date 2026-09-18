import Link from "next/link";
import { redirect } from "next/navigation";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { redirectToLogin } from "@/lib/require-user";
import { AdminNoticeListView } from "@/components/notices/admin-notice-list-view";
import { AdminNoticeReportsView } from "@/components/notices/admin-notice-reports-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Объявления — админка",
  robots: { index: false, follow: false },
};

export default async function AdminNoticesPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/notices");
  if (!canOpenAdminSection(user, "notices")) redirect("/");

  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Объявления
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Весь список ниже — с поиском и удалением. Жалобы и журнал удалений —
        отдельными разделами дальше на этой же странице.
      </p>

      {/* VED-42, круг 2: тестировщик не нашёл в админке ни списка объявлений,
          ни кнопки «Удалить» — были только жалобы и ссылка на журнал.
          Заголовок раздела задаёт сам компонент (AdminNoticeListView). */}
      <AdminNoticeListView />

      <hr className="my-8 border-glass-brd" />

      <h2 className="mb-1 font-display text-lg font-semibold text-text-0">
        Жалобы на объявления
      </h2>
      <p className="mb-2 text-sm text-text-1">
        Три открытые жалобы скрывают объявление автоматически. «Вернуть в
        ленту» снимает и скрытие, и метку автопроверки.
      </p>
      {/* Удаление чужого объявления пишется в общий журнал администрации, а
          не сюда — ссылкой, а не дублирующим списком. */}
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
