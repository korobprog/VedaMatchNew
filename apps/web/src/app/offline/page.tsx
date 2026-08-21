export const metadata = {
  title: "Нет подключения",
};

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg-0 px-4">
      <section className="glass max-w-md rounded-2xl border border-glass-brd p-6 text-center">
        <h1 className="font-display text-xl font-bold text-text-0">
          Нет подключения
        </h1>
        <p className="mt-3 text-sm text-text-1">
          Этот раздел недоступен без сети. Скачанные книги можно читать в
          библиотеке — они хранятся на устройстве.
        </p>
        <a
          href="/vedabase"
          className="mt-6 inline-block rounded-xl border border-glass-brd px-4 py-3 text-sm font-medium text-text-1 transition hover:text-text-0"
        >
          Открыть библиотеку
        </a>
      </section>
    </main>
  );
}
