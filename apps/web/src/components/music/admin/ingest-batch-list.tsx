"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  MusicIngestBatchDto,
  MusicUploadRightsBasis,
} from "@vedamatch/shared";
import { createIngestBatch } from "@/lib/music-admin-client-api";
import { formatBytes } from "@/lib/music-duration";
import { plural } from "@/lib/plural";
import { Alert } from "@/components/ui/alert";

const BASES: { value: MusicUploadRightsBasis; label: string }[] = [
  { value: "own_recording", label: "Своя запись" },
  { value: "open_program", label: "Запись с открытой программы" },
  { value: "freely_distributed", label: "Свободно распространяемая" },
];

/** Состояние партии — словом. Цвет рамки дублирует, но не заменяет его. */
const STATUS_LABELS: Record<MusicIngestBatchDto["status"], string> = {
  draft: "черновик",
  running: "в работе",
  ready: "готова к публикации",
  published: "опубликована",
  failed: "с ошибками",
};

const STATUS_BORDERS: Record<MusicIngestBatchDto["status"], string> = {
  draft: "border-glass-brd",
  running: "border-cyan/60",
  ready: "border-mint/60",
  published: "border-glass-brd",
  failed: "border-magenta/60",
};

const field =
  "h-9 w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0";

/**
 * Партии редакционного пополнения.
 *
 * Карточкой, а не строкой таблицы: до захода внутрь решают три вещи — что за
 * партия, в каком она состоянии и сколько места уже заняла. Объём здесь
 * потому, что потолок у партии общий, и упереться в него посреди заливки
 * сорока киртанов неприятнее, чем увидеть цифру заранее.
 */
export function IngestBatchList({
  batches,
}: {
  batches: MusicIngestBatchDto[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <NewBatchForm />

      {batches.length === 0 ? (
        <p className="text-sm text-text-1">
          Партий пока нет. Заведите первую — файлы, ссылки и архив добавляются
          уже внутри неё.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {batches.map((batch) => (
            <li key={batch.id}>
              <Link
                href={`/admin/music/ingest/${batch.id}`}
                className="glass flex flex-wrap items-center gap-3 rounded-2xl border border-glass-brd p-4 transition-colors hover:border-violet/40 motion-reduce:transition-none"
              >
                {/* На телефоне заголовок занимает строку целиком, и чип
                    состояния переезжает под него: делить 375 px пополам
                    значит показать «Киртаны с фе…», а по названию партию и
                    узнают. С `sm` оба снова в одну строку. */}
                <span className="min-w-0 grow basis-full sm:basis-0">
                  <span className="block truncate font-display text-base font-bold text-text-0">
                    {batch.title}
                  </span>
                  <span className="block truncate text-xs text-text-2">
                    {[
                      `${batch.itemCount} ${plural(batch.itemCount, "позиция", "позиции", "позиций")}`,
                      `готово ${batch.storedCount}`,
                      batch.failedCount > 0
                        ? `с ошибкой ${batch.failedCount}`
                        : null,
                      formatBytes(batch.sizeBytes),
                      batch.createdByName,
                      new Date(batch.createdAt).toLocaleDateString("ru-RU"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className={`inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-xs text-text-0 ${STATUS_BORDERS[batch.status]}`}
                >
                  {STATUS_LABELS[batch.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Новая партия: название и основание прав.
 *
 * Основание пустое по умолчанию — как в форме загрузки для всех. Отвечать
 * перед правообладателем будет портал, и предвыбранное значение означало бы,
 * что утверждение сделали за редактора, пока он придумывал название.
 */
function NewBatchForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [basis, setBasis] = useState<MusicUploadRightsBasis | "">("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!title.trim() || !basis) return;
    setPending(true);
    setError(null);
    try {
      const created = await createIngestBatch({
        title: title.trim(),
        rightsBasis: basis,
        rightsNote: note.trim() || undefined,
      });
      // Сразу внутрь: партия без позиций бесполезна, и следующий шаг всегда
      // один — добавить файлы.
      router.push(`/admin/music/ingest/${created.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось создать");
      setPending(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold"
        >
          Новая партия
        </button>
      </div>
    );
  }

  return (
    <section className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-4">
      <h2 className="font-display text-base font-bold text-text-0">
        Новая партия
      </h2>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">
          Название — по нему партию узнают в списке
        </span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Киртаны с фестиваля, август"
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">
          Основание прав — общее для всей партии
        </span>
        <select
          value={basis}
          onChange={(event) =>
            setBasis(event.target.value as MusicUploadRightsBasis | "")
          }
          className={field}
        >
          <option value="">Не выбрано</option>
          {BASES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">
          Откуда взяли — пригодится модератору через полгода
        </span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ссылка на страницу фестиваля, письмо организаторов"
          className={field}
        />
      </label>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!title.trim() || !basis || pending}
          onClick={() => void submit()}
          className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Заводим…" : "Завести"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-xl px-3 text-sm text-text-2 hover:text-text-0"
        >
          Отмена
        </button>
        {!basis && title.trim() && (
          <span className="text-xs text-text-2">Осталось выбрать основание</span>
        )}
      </div>
    </section>
  );
}
