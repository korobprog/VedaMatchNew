export default function VedabaseLoading() {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-center px-4 py-12">
      <div className="text-center" role="status" aria-live="polite">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Загружаем Vedabase…
        </p>
      </div>
    </main>
  );
}
