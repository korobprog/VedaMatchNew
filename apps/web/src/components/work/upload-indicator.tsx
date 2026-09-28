"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { describeUploadJob, type WorkUploadJob } from "./upload-queue";
import { workUploads } from "./work-uploads";

/** Сколько висит уведомление об удачной загрузке. Ошибка висит, пока не закроют. */
export const UPLOAD_DONE_VISIBLE_MS = 8_000;

const EMPTY: readonly WorkUploadJob[] = [];

/**
 * Индикатор загрузок «Работы» на всём портале (VED-608): «Загружаем 2 файла
 * в задачу VED-610» и итог, когда человек уже ушёл с доски. Смонтирован в
 * корневом layout — рядом с плеером, по той же причине: страница доски
 * умирает на первом переходе, а загрузка должна его пережить.
 *
 * Пока что-то уходит, вкладка:
 * - просит подтвердить закрытие или перезагрузку (`beforeunload`) — переход
 *   внутри портала это не трогает;
 * - держит Web Lock: Chrome не замораживает фоновую вкладку с блокировкой, и
 *   свёрнутый браузер на телефоне дольше не рвёт загрузку. Это «дольше», а не
 *   «всегда»: выгрузить фоновую вкладку система вправе в любой момент.
 */
export function WorkUploadIndicator() {
  const jobs = useSyncExternalStore(
    workUploads.subscribe,
    workUploads.getSnapshot,
    () => EMPTY,
  );
  const busy = jobs.some(
    (job) => job.phase === "creating" || job.phase === "uploading",
  );

  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Старые браузеры спрашивают только при непустом returnValue.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    let release: (() => void) | undefined;
    const locks = (
      navigator as Navigator & {
        locks?: {
          request: (name: string, cb: () => Promise<void>) => Promise<unknown>;
        };
      }
    ).locks;
    if (locks) {
      void locks
        .request(
          "vedamatch-work-uploads",
          () =>
            new Promise<void>((resolve) => {
              release = resolve;
            }),
        )
        .catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      release?.();
    };
  }, [busy]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-40 flex flex-col items-stretch gap-2 sm:left-auto sm:right-4 sm:w-80"
    >
      {jobs.map((job) => (
        <UploadToast key={job.id} job={job} />
      ))}
    </div>
  );
}

function UploadToast({ job }: { job: WorkUploadJob }) {
  const running = job.phase === "creating" || job.phase === "uploading";
  const trouble = job.phase === "failed" || Boolean(job.problem);
  const Icon = running ? Loader2 : trouble ? AlertTriangle : Check;
  const fadesAway = job.phase === "done" && !job.problem;

  // Удачный итог уходит сам; ошибка остаётся до закрытия.
  useEffect(() => {
    if (!fadesAway) return;
    const timer = window.setTimeout(
      () => workUploads.dismiss(job.id),
      UPLOAD_DONE_VISIBLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [fadesAway, job.id]);
  return (
    <div
      role={trouble ? "alert" : undefined}
      className="pointer-events-auto flex items-start gap-2 rounded-xl border border-glass-brd bg-sheet px-3 py-2 text-sm text-text-0 shadow-lg"
    >
      <Icon
        aria-hidden
        className={`mt-0.5 size-4 shrink-0 ${
          running
            ? "text-text-1 motion-safe:animate-spin"
            : trouble
              ? "text-magenta"
              : "text-text-1"
        }`}
      />
      <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {describeUploadJob(job)}
        {!running && job.href && (
          <>
            {" "}
            <Link
              href={job.href}
              onClick={() => workUploads.dismiss(job.id)}
              className="font-semibold text-text-0 underline underline-offset-2"
            >
              Открыть
            </Link>
          </>
        )}
      </p>
      {!running && (
        <button
          type="button"
          onClick={() => workUploads.dismiss(job.id)}
          aria-label="Скрыть уведомление"
          className="-my-1 -mr-2 flex size-8 shrink-0 items-center justify-center rounded-md text-text-2 hover:text-text-0"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}
