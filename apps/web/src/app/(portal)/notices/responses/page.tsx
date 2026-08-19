import { MyResponsesView } from "@/components/notices/my-responses-view";
import { NoticesNav } from "@/components/notices/notices-nav";

export const metadata = {
  title: "Мои отклики",
  robots: { index: false, follow: false },
};

export default async function MyResponsesPage() {

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Мои отклики
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Куда вы откликнулись и что ответили авторы. Контакты появляются
        только после согласия автора.
      </p>
      <NoticesNav />
      <MyResponsesView />
    </main>
  );
}
