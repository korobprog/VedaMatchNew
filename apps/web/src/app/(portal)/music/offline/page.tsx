import { MusicRail } from "@/components/music/music-rail";
import { MusicOfflineList } from "@/components/music/offline-list";

export const metadata = {
  title: "На устройстве",
  robots: { index: false, follow: false },
};

/**
 * Что сохранено на устройстве. См. docs/music-service-plan.md, этап 9.
 *
 * Страница нарочно почти пустая: список собирает клиент из IndexedDB, а не
 * сервер. Она обязана открываться именно тогда, когда сети нет, — иначе она
 * бесполезна ровно в тот момент, ради которого затевалась.
 */
export default function MusicOfflinePage() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10 lg:flex-row">
      <MusicRail active="offline" />

      <div className="min-w-0 flex-1">
        <h1 className="mb-1 font-display text-2xl font-bold tracking-tight text-text-0 md:text-3xl">
          На устройстве
        </h1>
        <p className="mb-5 text-sm text-text-2">
          Эти записи играют без сети. Они живут внутри портала: отдельным файлом
          их не сохранить, и они уйдут, если запись снимут с витрины.
        </p>

        <MusicOfflineList />
      </div>
    </main>
  );
}
