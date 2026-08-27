import type { Metadata } from "next";
import { MusicRail } from "@/components/music/music-rail";
import { MyMusicUploadsList } from "@/components/music/my-uploads-list";
import { MusicUploadForm } from "@/components/music/upload-form";
import { getMyMusicUploads } from "@/lib/music-api";
import { formatBytes } from "@/lib/music-duration";

export const metadata: Metadata = {
  title: "Мои загрузки",
  robots: { index: false, follow: false },
};

/**
 * Свои записи. См. docs/music-service-plan.md, этап 7.
 *
 * Загружать может любой вошедший, а не только редакция: сервис изначально
 * задуман так, что записи приносят с программ, а редакция их разбирает.
 * Поэтому форма здесь та же, что в админке, — разница в том, кто смотрит
 * очередь.
 *
 * Причина отказа показывается прямо на карточке: именно на эту страницу
 * ссылается модератор, когда пишет решение, и «отклонено» без слов означает
 * повторную заливку того же файла завтра.
 */
export default async function MyMusicUploadsPage() {
  const data = await getMyMusicUploads();

  const pending =
    data?.items.filter((item) => item.status !== "published").length ?? 0;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10 lg:flex-row">
      <MusicRail active="uploads" uploadsCount={pending} />

      <div className="min-w-0 max-w-3xl flex-1">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-0">
          Мои загрузки
        </h1>
        <p className="text-sm text-text-2">
          Каждая запись проходит разбор редакции. До него её слышите только вы —
          кнопкой «Послушать» ниже.
        </p>
      </header>

      {data && (
        <p className="mt-4 font-mono text-xs text-text-2">
          Занято {formatBytes(data.usage.usedBytes)} из{" "}
          {formatBytes(data.usage.quotaBytes)} · один файл до{" "}
          {formatBytes(data.usage.maxUploadBytes)}
        </p>
      )}

      <div className="mt-5">
        <MusicUploadForm />
      </div>

      <h2 className="mb-2 mt-8 font-display text-lg font-bold text-text-0">
        Что вы загрузили
      </h2>
      {/* Что происходит после загрузки, человеку не говорил никто: он видел
          «Ждёт разбора» и всё. Без этого ожидание превращается в вопрос
          «сломалось или нет». */}
      <p className="mb-4 max-w-2xl text-sm text-text-2">
        Редакция слушает запись, поправляет название и исполнителя и
        публикует — или отклоняет с причиной. Причина появится здесь же, на
        карточке. Пока запись ждёт разбора, её можно снять и освободить место.
      </p>
      {data ? (
        <MyMusicUploadsList items={data.items} />
      ) : (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Список сейчас недоступен. Попробуйте обновить страницу.
        </p>
      )}
      </div>
    </main>
  );
}
