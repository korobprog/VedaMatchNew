import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { NoticesCalendarView } from "@/components/notices/notices-calendar-view";
import { NoticesNav } from "@/components/notices/notices-nav";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Афиша общины",
  robots: { index: false, follow: false },
};

export default async function NoticesEventsPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
          Афиша
        </h1>
        <p className="mb-6 text-sm text-text-1">
          Программы, киртаны и фестивали. Повторяющиеся события показаны каждой
          датой; любое можно сохранить в календарь телефона.
        </p>
        <NoticesNav />
        <NoticesCalendarView />
      </main>
    </div>
  );
}
