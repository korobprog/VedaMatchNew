import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { NoticesNav } from "@/components/notices/notices-nav";
import { NoticesSubscriptionsView } from "@/components/notices/notices-subscriptions-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Подписки на объявления",
  robots: { index: false, follow: false },
};

export default async function NoticesSubscriptionsPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
          Подписки
        </h1>
        <p className="mb-6 text-sm text-text-1">
          Без подписок доску открывают раз в месяц. Уведомления можно целиком
          выключить в настройках профиля.
        </p>
        <NoticesNav />
        <NoticesSubscriptionsView />
      </main>
    </div>
  );
}
