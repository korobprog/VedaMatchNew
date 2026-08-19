import { NoticesCalendarView } from "@/components/notices/notices-calendar-view";
import { NoticesNav } from "@/components/notices/notices-nav";

export const metadata = {
  title: "Афиша общины",
  robots: { index: false, follow: false },
};

export default async function NoticesEventsPage() {

  return (
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
  );
}
