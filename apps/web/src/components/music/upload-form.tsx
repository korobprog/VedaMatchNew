"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MusicUploadRightsBasis } from "@vedamatch/shared";
import { MUSIC_ACCEPTED_MIME } from "@vedamatch/shared";
import { uploadMusicTrack } from "@/lib/music-client-api";
import { Alert } from "@/components/ui/alert";

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
  const [file, setFile] = useState<File | null>(null);
  /**
   * Пусто по умолчанию, и это не забывчивость.
   *
   * Основание прав — утверждение человека, а не поле формы: отвечать перед
   * правообладателем будет портал. Предвыбранное значение означает, что
   * утверждение сделано за него, пока он выбирал файл. План сервиса требует
   * ровно этого: «без отметки кнопка загрузки неактивна».
   */
  const [basis, setBasis] = useState<MusicUploadRightsBasis | "">("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (!file || !basis) return;
    setProgress(0);
    setError(null);
    setDone(null);
    try {
      const result = await uploadMusicTrack(
        file,
        basis as MusicUploadRightsBasis,
        setProgress,
      );
      setDone(`«${result.title}» ушла в очередь проверки.`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить");
    } finally {
      setProgress(null);
    }
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
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Файл</span>
          <input
            ref={inputRef}
            type="file"
            accept={MUSIC_ACCEPTED_MIME.join(",")}
            disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
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
            aria-label="Загрузка файла"
            className="h-1.5 w-full overflow-hidden rounded-full bg-glass-brd"
          >
            <div
              className="h-full bg-mint transition-[width] duration-150 motion-reduce:transition-none"
              style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-xs text-text-2">
            {Math.round((progress ?? 0) * 100)}%
          </p>
        </div>
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
          disabled={!file || !basis || busy}
          onClick={() => void submit()}
          className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Загружаем…" : "Загрузить"}
        </button>
        {file && !basis && (
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
