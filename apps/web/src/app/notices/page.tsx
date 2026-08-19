import { Header } from "@/components/header";
import { redirectToLogin } from "@/lib/require-user";
import { NoticesFeedView } from "@/components/notices/notices-feed-view";
import { NoticesNav } from "@/components/notices/notices-nav";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Объявления — доска общины",
  description:
    "Некоммерческая доска: отдам даром, нужны руки, попутчики, программы ятр.",
  // Доска с именами, городами и способами связи не должна попадать в поисковики.
  robots: { index: false, follow: false },
};

export default async function NoticesPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/notices");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-28">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
            Объявления
          </h1>
          <p className="mt-1 text-sm text-text-1">
            Доска общины: отдать даром, найти руки, доехать вместе, позвать на
            программу. Всё, где нужны деньги, живёт в Рынке.
          </p>
        </div>

        <NoticesNav />
        <NoticesFeedView />
      </main>
    </div>
  );
}
