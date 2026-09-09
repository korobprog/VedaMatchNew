import { CallsProbeView } from "@/components/chat/calls/calls-probe-view";

export const metadata = {
  title: "Проверка сети для звонков",
  // Служебная страница команды: в поиске ей делать нечего.
  robots: { index: false, follow: false },
};

export default function CallsProbePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Проверка сети для звонков
        </h1>
        <p className="mt-1 text-sm text-text-2">
          Этап разведки: см. docs/chat-calls-plan.md
        </p>
      </div>
      <CallsProbeView />
    </main>
  );
}
