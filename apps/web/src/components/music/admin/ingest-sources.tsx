"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MUSIC_ACCEPTED_MIME } from "@vedamatch/shared";
import {
  addIngestArchive,
  addIngestFiles,
  addIngestUrls,
  completeIngestFile,
} from "@/lib/music-admin-client-api";
import { Alert } from "@/components/ui/alert";

type Tab = "files" | "urls" | "zip";

const TABS: { key: Tab; label: string }[] = [
  { key: "files", label: "Файлы" },
  { key: "urls", label: "Ссылки" },
  { key: "zip", label: "Архив" },
];

/** Больше трёх параллельных заливок забивают канал так, что не отвечает страница. */
const PARALLEL_UPLOADS = 3;

/**
 * Три способа добавить позиции в партию: файлы с диска, список ссылок, архив.
 *
 * Вкладками, а не тремя формами подряд: способ выбирают один раз на партию, и
 * два неиспользуемых блока только удлиняли бы экран.
 */
export function IngestSources({ batchId }: { batchId: string }) {
  const [tab, setTab] = useState<Tab>("files");

  return (
    <section className="glass flex flex-col gap-4 rounded-2xl border border-glass-brd p-4">
      <h2 className="font-display text-lg font-bold text-text-0">
        Добавить в партию
      </h2>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Откуда брать записи">
        {TABS.map((option) => {
          const current = option.key === tab;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={current}
              onClick={() => setTab(option.key)}
              className={`h-9 rounded-full border px-4 text-sm font-semibold transition-colors motion-reduce:transition-none ${
                current
                  ? "border-violet/40 bg-violet/15 text-text-0"
                  : "border-glass-brd text-text-1 hover:text-text-0"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {tab === "files" && <FilesTab batchId={batchId} />}
      {tab === "urls" && <UrlsTab batchId={batchId} />}
      {tab === "zip" && <ZipTab batchId={batchId} />}
    </section>
  );
}

function FilesTab({ batchId }: { batchId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  /** Доля от 0 до 1 по имени файла: полоса на каждый, а не одна общая. */
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setProgress({});

    try {
      const created = await addIngestFiles(batchId, {
        files: files.map((file) => ({
          fileName: file.name,
          mime: file.type,
          sizeBytes: file.size,
        })),
      });

      // Позиции приходят в порядке заявки — сопоставляем по индексу.
      const jobs = created.items.map((item, at) => ({
        item,
        file: files[at]!,
      }));
      let next = 0;
      let failed = 0;

      async function worker(): Promise<void> {
        while (next < jobs.length) {
          const job = jobs[next++]!;
          try {
            await putSigned(
              job.item.url,
              job.item.headers,
              job.file,
              (fraction) =>
                setProgress((was) => ({ ...was, [job.file.name]: fraction })),
            );
            await completeIngestFile(batchId, job.item.itemId);
          } catch {
            // Свой отказ у каждого файла — не тот формат, обрыв канала.
            // Останавливать пачку из-за одного значит заставить редакцию
            // начинать заново.
            failed += 1;
            setProgress((was) => ({ ...was, [job.file.name]: -1 }));
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(PARALLEL_UPLOADS, jobs.length) }, worker),
      );

      setNote(
        failed === 0
          ? `Залито: ${jobs.length}. Дальше сервер прочитает теги.`
          : `Залито: ${jobs.length - failed} из ${jobs.length}, не удалось ${failed}.`,
      );
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось добавить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">
          Файлы — можно выбрать сразу несколько. Принимаем mp3 и m4a.
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={MUSIC_ACCEPTED_MIME.join(",")}
          disabled={busy}
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          className="w-full text-sm text-text-1 file:mr-3 file:h-9 file:rounded-lg file:border file:border-glass-brd file:bg-bg-1 file:px-3 file:text-sm file:text-text-0"
        />
      </label>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((file) => {
            const done = progress[file.name];
            return (
              <li key={file.name} className="flex items-baseline gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-text-1">
                  {file.name}
                </span>
                <span className="shrink-0 text-text-2">
                  {done === undefined
                    ? "ждёт"
                    : done < 0
                      ? "не удалось"
                      : done >= 1
                        ? "залит"
                        : `${Math.round(done * 100)}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {note && <Alert tone="success">{note}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div>
        <button
          type="button"
          disabled={files.length === 0 || busy}
          onClick={() => void submit()}
          className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Заливаем…" : `Залить ${files.length || ""}`.trim()}
        </button>
      </div>
    </div>
  );
}

function UrlsTab({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const urls = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (urls.length === 0) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await addIngestUrls(batchId, { urls });
      setNote(`Добавлено адресов: ${result.added}. Скачает сервер.`);
      setText("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось добавить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">
          По адресу на строку. Качает сервер — вкладку можно закрыть.
        </span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={6}
          disabled={busy}
          placeholder={"https://example.org/kirtan-01.mp3\nhttps://example.org/kirtan-02.mp3"}
          className="w-full rounded-lg border border-glass-brd bg-bg-1 p-2.5 font-mono text-sm text-text-0"
        />
      </label>

      {note && <Alert tone="success">{note}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div>
        <button
          type="button"
          disabled={busy || text.trim().length === 0}
          onClick={() => void submit()}
          className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Добавляем…" : "Добавить ссылки"}
        </button>
      </div>
    </div>
  );
}

/**
 * Архив с альбомом.
 *
 * Льётся тем же подписанным PUT, что и одиночные записи: браузер кладёт его
 * прямо в бакет, а сервер потом разбирает оттуда потоком. Обложки, тексты и
 * мусор macOS в архиве пропускаются молча — в чужом архиве они есть всегда.
 */
function ZipTab({ batchId }: { batchId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setProgress(0);

    try {
      const created = await addIngestArchive(batchId, {
        fileName: file.name,
        sizeBytes: file.size,
        mime: file.type,
      });
      await putSigned(created.url, created.headers, file, setProgress);
      await completeIngestFile(batchId, created.itemId);
      setNote(
        "Архив залит. Сервер разберёт его и заведёт позицию на каждую запись.",
      );
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось залить архив");
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">
          Один архив .zip с записями альбома. Берём из него mp3 и m4a;
          обложки и служебные файлы пропускаем.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          disabled={busy}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="w-full text-sm text-text-1 file:mr-3 file:h-9 file:rounded-lg file:border file:border-glass-brd file:bg-bg-1 file:px-3 file:text-sm file:text-text-0"
        />
      </label>

      {file && (
        <p className="flex items-baseline gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-text-1">{file.name}</span>
          <span className="shrink-0 text-text-2">
            {progress === null
              ? "ждёт"
              : progress >= 1
                ? "залит"
                : `${Math.round(progress * 100)}%`}
          </span>
        </p>
      )}

      {note && <Alert tone="success">{note}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div>
        <button
          type="button"
          disabled={!file || busy}
          onClick={() => void submit()}
          className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Заливаем…" : "Залить архив"}
        </button>
      </div>
    </div>
  );
}

/**
 * Подписанный PUT в бакет.
 *
 * Заголовки берём ровно те, что вернул сервер: они вошли в подпись, и
 * расхождение S3 встречает 403, в котором по логам браузера не разобраться.
 * `Content-Length` пропускаем — браузер запрещает выставлять его вручную и
 * всё равно подставляет длину тела сам.
 */
function putSigned(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      if (name.toLowerCase() === "content-length") continue;
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`Хранилище отказало (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Не удалось передать файл"));
    xhr.send(file);
  });
}
