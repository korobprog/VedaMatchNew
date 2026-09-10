"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MusicArtistsFromTagsResult } from "@vedamatch/shared";
import { scanMusicArtistsFromTags } from "@/lib/music-admin-client-api";
import { Alert } from "@/components/ui/alert";
import { plural } from "@/lib/plural";

/**
 * Разбор коллекции: исполнители по тегам уже залитых записей.
 *
 * Каталог наполнялся партиями, а исполнителя у партии не выбирали — и в
 * витрине у каждой записи стояло «Исполнитель не указан», справочник был
 * пуст, а секция «Исполнители» не показывалась вовсе. Имя при этом лежит в
 * самих файлах: из тега берётся даже название записи.
 *
 * Два шага, а не один: сначала список имён, потом кнопка. Заведение сотни
 * исполнителей вслепую отменять было бы нечем.
 */
export function MusicArtistsFromTags() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MusicArtistsFromTagsResult | null>(null);

  const run = async (dryRun: boolean) => {
    setPending(true);
    setError(null);
    try {
      const next = await scanMusicArtistsFromTags(dryRun);
      setResult(next);
      // Справочники и список записей на этой же странице: после настоящего
      // прогона они врут, пока страница не перечитана.
      if (!dryRun) router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    } finally {
      setPending(false);
    }
  };

  const tracks = (n: number) =>
    `${n} ${plural(n, "запись", "записи", "записей")}`;

  return (
    <section className="glass mb-5 rounded-2xl border border-glass-brd p-4">
      <h2 className="font-display text-base font-bold text-text-0">
        Исполнители по тегам
      </h2>
      <p className="mt-1.5 text-sm text-text-1">
        Пройдёт по записям, у которых исполнитель не указан, прочитает имя из
        тега файла и заведёт недостающих. Уже заведённых не трогает, отметку
        «проверен» не ставит — её ставит редакция.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(true)}
          disabled={pending}
          className="h-9 rounded-xl border border-glass-brd px-3.5 text-sm font-semibold text-text-1 hover:text-text-0 disabled:opacity-60"
        >
          {pending ? "Смотрим…" : "Посмотреть, что получится"}
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending}
          className="btn-mint h-9 rounded-xl px-3.5 text-sm font-bold disabled:opacity-60"
        >
          Завести и привязать
        </button>
      </div>

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {result && (
        <div className="mt-4">
          <p className="text-sm text-text-1">
            {result.dryRun ? "Пока только показали. " : "Готово. "}
            Посмотрели {tracks(result.scanned)} без исполнителя, имя нашлось у{" "}
            {result.withTag}.{" "}
            {result.dryRun
              ? `Заведём исполнителей: ${result.artistsCreated}, из справочника подойдут: ${result.artistsMatched}.`
              : `Заведено исполнителей: ${result.artistsCreated}, привязано ${tracks(result.tracksLinked)}.`}
          </p>
          {result.remaining > 0 && (
            <p className="mt-1 text-sm text-text-2">
              Без исполнителя осталось {tracks(result.remaining)} — за прогон
              разбираем не больше четырёхсот, нажмите ещё раз.
            </p>
          )}

          {result.groups.length === 0 ? (
            <p className="mt-3 text-sm text-text-2">
              Имён в тегах не нашлось: исполнителя таким записям придётся
              указать руками — в списке записей ниже.
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {result.groups.map((group) => (
                <li
                  key={group.name}
                  className="rounded-full border border-glass-brd px-2.5 py-1 text-xs text-text-1"
                >
                  {group.name}
                  <span className="ml-1.5 font-mono text-text-2">
                    {group.trackCount}
                  </span>
                  {group.existed && (
                    <span className="ml-1.5 text-text-2">уже есть</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
