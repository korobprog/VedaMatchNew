import { redirect } from "next/navigation";
import { AdminVacanciesView } from "@/components/vacancies/admin-vacancies-view";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";

export const metadata = {
  title: "Вакансии — админка",
  robots: { index: false, follow: false },
};

export default async function AdminVacanciesPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/vacancies");
  if (!canOpenAdminSection(user, "vacancies")) redirect("/");

  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Вакансии
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Жалобы, предложения и отклики. Скрытие с причиной: автор увидит её на
        своей карточке.
      </p>
      <AdminVacanciesView />
    </>
  );
}
