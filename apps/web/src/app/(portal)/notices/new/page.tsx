import { NoticeForm } from "@/components/notices/notice-form";
import { NoticesNav } from "@/components/notices/notices-nav";

export const metadata = {
  title: "Новое объявление",
  robots: { index: false, follow: false },
};

export default async function NewNoticePage() {

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
        Новое объявление
      </h1>
      <NoticesNav />
      <NoticeForm />
    </main>
  );
}
