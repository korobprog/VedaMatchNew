"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MusicArtistsFromTagsResult } from "@vedamatch/shared";
import { scanMusicArtistsFromTags } from "@/lib/music-admin-client-api";
import { Alert } from "@/components/ui/alert";
import { plural } from "@/lib/plural";

/**
 * Разбор коллекции: исполнители по тегам и названиям уже залитых записей.
 *
 * Каталог наполнялся партиями, а исполнителя у партии не выбирали — и в
 * витрине у каждой записи стояло «Исполнитель не указан», справочник был
 * пуст, а секция «Исполнители» не показывалась вовсе. Имя при этом лежит в
 * самих файлах: в теге, а если тега нет — прямо в названии, «Jahnavi dasi -
 * Maha Mantra».
 *
 * Два шага, а не один: сначала список имён, потом кнопка. Заведение сотни
 * исполнителей вслепую отменять было бы нечем. Имя из названия — подсказка
 * слабее тега («Maha Mantra - Live» тоже «кто - что»), поэтому у каждого имени
 * галочка: снятое не заводится, и записи с ним остаются как были.
 */
export function MusicArtistsFromTags() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MusicArtistsFromTagsResult | null>(null);
  /** Ключи имён, снятых с применения. */
  const [skip, setSkip] = useState<Set<string>>(new Set());
  /**
   * С какого места разбирается текущая пачка. Применение идёт по той же
   * пачке, что показал предпросмотр, — иначе галочки относились бы к другим
   * записям.
   */
  const [after, setAfter] = useState<string | undefined>(undefined);

  const run = async (dryRun: boolean, from = after) => {
    setPending(true);
    setError(null);
    try {
      const next = await scanMusicArtistsFromTags(dryRun, {
        after: from,
        skip: dryRun ? [] : [...skip],
      });
      setResult(next);
      setAfter(from);
      // Новая пачка — новые имена: прежние галочки к ним не относятся.
      if (dryRun && from !== after) setSkip(new Set());
      // Справочники и список записей на этой же странице: после настоящего
      // прогона они врут, пока страница не перечитана.
      if (!dryRun) {
        setSkip(new Set());
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    } finally {
      setPending(false);
    }
  };

  const toggle = (key: string) =>
    setSkip((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const tracks = (n: number) =>
    `${n} ${plural(n, "запись", "записи", "записей")}`;
  const preview = result?.dryRun === true;

  return (
    <section className="glass mb-5 rounded-2xl border border-glass-brd p-4">
      <h2 className="font-display text-base font-bold text-text-0">
        Исполнители по тегам и названиям
      </h2>
      <p className="mt-1.5 text-sm text-text-1">
        Пройдёт по записям, у которых исполнитель не указан, возьмёт имя из
        тега файла, а если тега нет — из названия вида «Имя - Песня», и
        заведёт недостающих. Из названия имя уходит: остаётся только песня.
        Уже заведённых не трогает, отметку «проверен» не ставит — её ставит
        редакция.
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
          // Без предпросмотра галочек нет: заводить вслепую не даём.
          disabled={pending || !preview}
          title={preview ? undefined : "Сначала посмотрите, что получится"}
          className="btn-mint h-9 rounded-xl px-3.5 text-sm font-bold disabled:opacity-60"
        >
          Завести и привязать
        </button>
        {result?.nextCursor && (
          <button
            type="button"
            onClick={() => run(true, result.nextCursor ?? undefined)}
            disabled={pending}
            className="h-9 rounded-xl border border-glass-brd px-3.5 text-sm font-semibold text-text-1 hover:text-text-0 disabled:opacity-60"
          >
            Следующие записи
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {result && (
        <div className="mt-4">
          <p className="text-sm text-text-1">
            {preview ? "Пока только показали. " : "Готово. "}
            Посмотрели {tracks(result.scanned)} без исполнителя, имя нашлось у{" "}
            {result.withTag}
            {result.fromTitle > 0 && `, из них в названии — у ${result.fromTitle}`}
            .{" "}
            {preview
              ? `Заведём исполнителей: ${result.artistsCreated}, из справочника подойдут: ${result.artistsMatched}, названий поменяется: ${result.titlesRenamed}.`
              : `Заведено исполнителей: ${result.artistsCreated}, привязано ${tracks(result.tracksLinked)}, названий поменялось: ${result.titlesRenamed}.`}
          </p>
          {result.remaining > 0 && (
            <p className="mt-1 text-sm text-text-2">
              Без исполнителя всего {tracks(result.remaining)}.{" "}
              {result.nextCursor
                ? "За раз разбираем не больше четырёхсот — «Следующие записи» покажет дальше."
                : "Остальным исполнителя придётся указать руками — в списке записей ниже."}
            </p>
          )}

          {result.groups.length === 0 ? (
            <p className="mt-3 text-sm text-text-2">
              Имён не нашлось ни в тегах, ни в названиях: исполнителя таким
              записям придётся указать руками — в списке записей ниже.
            </p>
          ) : (
            <ul className="mt-3 space-y-2" aria-label="Найденные исполнители">
              {result.groups.map((group) => {
                const checked = !skip.has(group.key) && !group.skipped;
                return (
                  <li
                    key={group.key}
                    className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1"
                  >
                    <label className="flex flex-wrap items-center gap-2">
                      {preview && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(group.key)}
                          className="size-4 accent-cyan"
                        />
                      )}
                      <span
                        className={
                          checked
                            ? "font-semibold text-text-0"
                            : "text-text-2 line-through"
                        }
                      >
                        {group.name}
                      </span>
                      <span className="font-mono text-xs text-text-2">
                        {group.trackCount}
                      </span>
                      {group.existed && (
                        <span className="text-xs text-text-2">уже есть</span>
                      )}
                      {group.fromTitle > 0 && (
                        <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs text-text-1">
                          {group.fromTitle === group.trackCount
                            ? "из названия"
                            : `из названия: ${group.fromTitle}`}
                        </span>
                      )}
                    </label>
                    {group.renames.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-6 text-xs text-text-2">
                        {group.renames.map((rename) => (
                          <li key={rename.before} className="break-words">
                            «{rename.before}» → «{rename.after}»
                          </li>
                        ))}
                        {group.renameCount > group.renames.length && (
                          <li>
                            и ещё {group.renameCount - group.renames.length}
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
