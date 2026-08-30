"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MusicUploadRightsBasis } from "@vedamatch/shared";
import { MUSIC_ACCEPTED_MIME } from "@vedamatch/shared";
import { uploadMusicTrack } from "@/lib/music-client-api";
import { getTrack } from "@/lib/music-playback-api";
import { keepUploadedTrackOffline } from "@/lib/music/offline-manager";
import { Alert } from "@/components/ui/alert";
import { useMusicPlayer } from "./player/player-provider";

const BASES: { value: MusicUploadRightsBasis; label: string }[] = [
  { value: "own_recording", label: "Своя запись" },
  { value: "open_program", label: "Запись с открытой программы" },
  { value: "freely_distributed", label: "Свободно распространяемая" },
];

/**
 * Загрузка записи.
 *
 * Одна форма и для редакции, и для любого вошедшего: правило «сначала
 * очередь, потом каталог» одинаково для всех, и заводить второй экран ради
 * тех же трёх полей незачем. Разница только в том, кто разбирает очередь.
 *
 * Файл идёт мимо API — подписанный PUT прямо в бакет, — поэтому здесь виден
 * прогресс: заливка киртана на сотню мегабайт длится минуту, и страница без
 * полосы выглядит зависшей.
 *
 * Основание прав выбирается всегда, даже когда грузит администратор.
 * Отвечать перед правообладателем будет портал, и «я же админ» в этом
 * разговоре не аргумент — отметка нужна модератору, который откроет запись
 * через полгода.
 */
export function MusicUploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  /**
   * Что стало с каждым файлом. Ключ — имя: очередь короткая и своя, а
   * тащить в неё синтетические идентификаторы ради красоты незачем.
   */
  const [results, setResults] = useState<
    Record<string, { state: "ok" | "failed"; note: string; kept?: boolean }>
  >({});
  const [currentName, setCurrentName] = useState<string | null>(null);
  /**
   * Пусто по умолчанию, и это не забывчивость.
   *
   * Основание прав — утверждение человека, а не поле формы: отвечать перед
   * правообладателем будет портал. Предвыбранное значение означает, что
   * утверждение сделано за него, пока он выбирал файл. План сервиса требует
   * ровно этого: «без отметки кнопка загрузки неактивна».
   */
  const [basis, setBasis] = useState<MusicUploadRightsBasis | "">("");
  /**
   * Чьё офлайн-хранилище открыто. Берём у плеера — он единственный, кто знает
   * человека в этом поддереве, и ровно так же спрашивает кнопка «скачать».
   */
  const offlineUserId = useMusicPlayer()?.offlineUserId ?? null;
  /**
   * Оставлять ли копию на устройстве.
   *
   * Отмечено по умолчанию: файл уже здесь, и класть его в хранилище стоит
   * ноль трафика — а без этого человек, которому запись нужна в дороге,
   * скачивает обратно то, что сам залил. Снять отметку можно: на телефоне с
   * забитой памятью копия десятка киртанов не нужна никому.
   */
  const [keepCopy, setKeepCopy] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /**
   * Файлы уходят по одному, а не разом. Параллельная заливка десятка
   * киртанов забивает канал так, что не отвечает и сама страница, а
   * подписанный PUT у каждой записи свой — очередь тут ничего не теряет.
   *
   * Неудача одного файла не останавливает остальные, в отличие от скачивания
   * в офлайн: там причина почти всегда общая (кончилось место), а здесь —
   * своя у каждого файла: не тот формат, слишком длинный, битые теги.
   * Останавливать всю пачку из-за одного значит заставить редакцию начинать
   * заново.
   */
  async function submit() {
    if (files.length === 0 || !basis) return;
    setError(null);
    setDone(null);
    setResults({});

    let ok = 0;
    for (const file of files) {
      setCurrentName(file.name);
      setProgress(0);
      try {
        const result = await uploadMusicTrack(
          file,
          basis as MusicUploadRightsBasis,
          setProgress,
        );
        ok += 1;
        // Копию кладём тем же файлом, что только что уехал в бакет: байты уже
        // в браузере, и качать их обратно незачем. Карточку приходится
        // спросить — в ответе на завершение заливки её нет, а в хранилище без
        // неё запись негде подписать.
        let kept = false;
        if (keepCopy && offlineUserId) {
          try {
            const card = await getTrack(result.trackId);
            if (card) {
              await keepUploadedTrackOffline(offlineUserId, card, file);
              kept = true;
            }
          } catch {
            // Не хватило места или запрещено хранилище. Заливка при этом
            // удалась, и объявлять её неудачной из-за копии нельзя: запись
            // на портале есть, друзья её услышат.
          }
        }
        setResults((was) => ({
          ...was,
          [file.name]: { state: "ok", note: result.title, kept },
        }));
      } catch (cause) {
        setResults((was) => ({
          ...was,
          [file.name]: {
            state: "failed",
            note:
              cause instanceof Error ? cause.message : "Не удалось загрузить",
          },
        }));
      }
    }

    setCurrentName(null);
    setProgress(null);
    setDone(
      files.length === 1
        ? "Запись ушла в очередь проверки."
        : `Готово: ${ok} из ${files.length} ушли в очередь проверки.`,
    );
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  const busy = progress !== null;

  return (
    <section className="glass rounded-2xl border border-glass-brd p-4">
      <h3 className="font-display text-base font-bold text-text-0">
        Загрузить запись
      </h3>
      <p className="mt-1 text-sm text-text-2">
        Принимаем mp3 и m4a. Название и исполнителя редакция поправит — если в
        файле они записаны неточно, переделывать и перезаливать не нужно.
        Файлы уходят по очереди; неудача одного не останавливает остальные.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">
            Файлы — можно выбрать сразу несколько
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={MUSIC_ACCEPTED_MIME.join(",")}
            disabled={busy}
            onChange={(event) =>
              setFiles(Array.from(event.target.files ?? []))
            }
            className="w-full text-sm text-text-1 file:mr-3 file:h-9 file:rounded-lg file:border file:border-glass-brd file:bg-bg-1 file:px-3 file:text-sm file:text-text-0"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">
            Основание — от него зависит, попадёт ли запись в каталог сразу
          </span>
          <select
            value={basis}
            disabled={busy}
            onChange={(event) =>
              setBasis(event.target.value as MusicUploadRightsBasis | "")
            }
            className="h-9 w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0"
          >
            <option value="">Не выбрано</option>
            {BASES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {busy && (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-valuenow={Math.round((progress ?? 0) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={currentName ? `Загрузка: ${currentName}` : "Загрузка файла"}
            className="h-1.5 w-full overflow-hidden rounded-full bg-glass-brd"
          >
            <div
              className="h-full bg-mint transition-[width] duration-150 motion-reduce:transition-none"
              style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </div>
          <p className="mt-1 truncate text-xs text-text-2">
            <span className="font-mono">{Math.round((progress ?? 0) * 100)}%</span>
            {currentName && ` · ${currentName}`}
          </p>
        </div>
      )}

      {offlineUserId && (
        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={keepCopy}
            disabled={busy}
            onChange={(event) => setKeepCopy(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="flex flex-col">
            <span className="text-sm text-text-0">
              Оставить копию на этом устройстве
            </span>
            <span className="text-xs text-text-2">
              Запись будет играть без сети. Трафика это не стоит — файл уже
              здесь, качать его обратно не придётся.
            </span>
          </span>
        </label>
      )}

      {(files.length > 0 || Object.keys(results).length > 0) && (
        <ul className="mt-3 flex flex-col gap-1">
          {(files.length > 0 ? files.map((f) => f.name) : Object.keys(results)).map(
            (name) => {
              const result = results[name];
              return (
                <li
                  key={name}
                  className="flex items-baseline gap-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate text-text-1">
                    {name}
                  </span>
                  <span
                    className={
                      result?.state === "failed"
                        ? "shrink-0 text-magenta"
                        : result?.state === "ok"
                          ? "shrink-0 text-cyan"
                          : "shrink-0 text-text-2"
                    }
                  >
                    {result?.state === "failed"
                      ? result.note
                      : result?.state === "ok"
                        ? result.kept
                          ? "в очереди · копия здесь"
                          : "в очереди"
                        : currentName === name
                          ? "загружается"
                          : "ждёт"}
                  </span>
                </li>
              );
            },
          )}
        </ul>
      )}

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {done && (
        <div className="mt-3">
          <Alert tone="success">{done}</Alert>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={files.length === 0 || !basis || busy}
          onClick={() => void submit()}
          className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          {busy
            ? "Загружаем…"
            : files.length > 1
              ? `Загрузить ${files.length}`
              : "Загрузить"}
        </button>
        {files.length > 0 && !basis && (
          <span className="text-xs text-text-2">
            Осталось отметить основание
          </span>
        )}
        {basis && (
          <span className="text-xs text-text-2">
            {basis === "open_program"
              ? "Чужое исполнение — запись пойдёт на проверку редакцией."
              : "Появится в каталоге сразу. Жалобы слушателей её скроют."}
          </span>
        )}
      </div>
    </section>
  );
}
