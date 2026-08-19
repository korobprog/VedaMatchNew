import { NoticesFeedView } from "@/components/notices/notices-feed-view";
import { NoticesNav } from "@/components/notices/notices-nav";

export const metadata = {
  title: "Мои объявления",
  robots: { index: false, follow: false },
};

export default async function MyNoticesPage() {

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-28">
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Мои объявления
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Здесь всё, что вы публиковали, — включая скрытое и с вышедшим сроком.
      </p>
      <NoticesNav />
      <NoticesFeedView mine />
    </main>
  );
}
