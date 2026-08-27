import { MusicAdminTabs } from "@/components/music/admin/admin-tabs";
import { MusicModerationCard } from "@/components/music/admin/moderation-card";
import { formatBytes } from "@/lib/music-duration";
import {
  getMusicAdminArtists,
  getMusicAdminCategories,
  getMusicAdminSummary,
  getMusicModerationQueue,
} from "@/lib/music-admin-api";

export const metadata = {
  title: "Очередь Музыки",
  robots: { index: false, follow: false },
};

/**
 * Очередь модерации Музыки.
 *
 * Справочники грузятся вместе с очередью, а не по клику: модератор
 * привязывает исполнителя и раздел в той же карточке, и подгрузка списка на
 * каждое открытие селекта — лишний круг там, где счёт идёт на секунды.
 */
export default async function AdminMusicQueuePage() {
  const [summary, queue, artists, categories] = await Promise.all([
    getMusicAdminSummary(),
    getMusicModerationQueue(),
    getMusicAdminArtists(),
    getMusicAdminCategories(),
  ]);

  const items = queue ?? [];

  const stats = summary && [
    { label: "Ждут проверки", value: String(summary.pending) },
    { label: "В каталоге", value: String(summary.published) },
    { label: "Скрыто", value: String(summary.hidden) },
    { label: "Исполнителей", value: String(summary.artists) },
    { label: "Жалоб открыто", value: String(summary.openReports) },
    { label: "Занято", value: formatBytes(summary.storedBytes) },
  ];

  return (
    <>
      <MusicAdminTabs active="queue" pendingCount={summary?.pending ?? 0} />

      {stats && (
        <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="glass rounded-xl border border-glass-brd p-3"
            >
              <dt className="text-xs text-text-2">{stat.label}</dt>
              <dd className="font-mono text-lg text-text-0">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mb-4 max-w-3xl text-sm text-text-1">
        Публикация — последний шаг: сначала послушайте, потом привяжите
        исполнителя и раздел. Опубликованная запись без них не находится ни
        фильтром, ни поиском. Отказ требует причины — человек увидит её в своих
        загрузках, а «отклонено» без слов гарантирует повторную заливку того же
        файла.
      </p>

      {items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Очередь пуста. Записи появятся здесь, как только их загрузят — со
          вкладки «Справочники» или из сервиса.
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <MusicModerationCard
              key={item.track.id}
              item={item}
              artists={artists?.items ?? []}
              categories={categories?.items ?? []}
            />
          ))}
        </ul>
      )}
    </>
  );
}
