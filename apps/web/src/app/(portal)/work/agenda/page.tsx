import { WorkAgendaView } from "@/components/work/agenda-view";

export const metadata = {
  title: "Мой день — Работа",
  description: "Задачи со сроком по всем рабочим средам сразу.",
  robots: { index: false, follow: false },
};

export default function WorkAgendaPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0 sm:text-3xl">
        Мой день
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Что назначено на вас — из всех рабочих сред сразу.
      </p>
      <WorkAgendaView />
    </main>
  );
}
