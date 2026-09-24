"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Trash2, Upload } from "lucide-react";
import type {
  MusicRadioInsertDto,
  MusicRadioInsertStatus,
} from "@vedamatch/shared";
import {
  createMusicRadioInsert,
  deleteMusicRadioInsert,
  fetchMusicRadioInserts,
} from "@/lib/music-radio-client";
import { Alert } from "@/components/ui/alert";
import { formatTrackDuration } from "@/lib/music-duration";

const field =
  "min-h-11 w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0";

const STATUS_LABEL: Record<MusicRadioInsertStatus, string> = {
  scheduled: "ждёт эфира",
  on_air: "в эфире",
  aired: "прозвучала",
};

const ACCEPT = "audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav,.mp3,.m4a";

/** Длительность файла по данным браузера — на случай записи без неё. */
function measureDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      // WebM с микрофона отдаёт Infinity, пока не перемотать в конец.
      if (Number.isFinite(audio.duration)) return done(audio.duration);
      audio.currentTime = 1e9;
      audio.ontimeupdate = () => {
        audio.ontimeupdate = null;
        done(Number.isFinite(audio.duration) ? audio.duration : null);
      };
    };
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/** Значение `datetime-local` → ISO с часовым поясом устройства. */
function localToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Голосовые вставки в эфир «Радио VM» (VED-437). Два режима: «Сейчас» —
 * вставка обрывает то, что звучит, и выходит в эфир сразу (слушатели
 * услышат её в пределах 20 секунд); «По таймеру» — в назначенную минуту.
 *
 * Запись — файлом или прямо с микрофона.
 */
export function MusicRadioInsertsEditor({
  initial,
}: {
  initial: MusicRadioInsertDto[];
}) {
  const [inserts, setInserts] = useState(initial);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"now" | "timer">("now");
  const [when, setWhen] = useState("");
  const [file, setFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(
    () => (file ? URL.createObjectURL(file.blob) : null),
    [file],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function reload() {
    try {
      setInserts((await fetchMusicRadioInserts()).inserts);
    } catch {
      // Список обновится при следующем действии.
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const type = recorder.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : "webm";
        setFile({
          blob: new Blob(chunks, { type }),
          name: `voice.${ext}`,
        });
        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Нет доступа к микрофону — разрешите его в браузере");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  async function submit() {
    if (!file) return;
    const scheduledAt = mode === "timer" ? localToIso(when) : null;
    if (mode === "timer" && !scheduledAt) {
      setError("Укажите дату и время выхода");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const durationSeconds = await measureDuration(file.blob);
      const created = await createMusicRadioInsert({
        file: file.blob,
        fileName: file.name,
        title: title.trim(),
        scheduledAt,
        durationSeconds,
      });
      setNotice(
        mode === "now"
          ? "Вставка в эфире — слушатели услышат её в течение 20 секунд."
          : `Вставка выйдет в эфир ${formatWhen(created.scheduledAt)}.`,
      );
      setTitle("");
      setFile(null);
      setWhen("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось");
    } finally {
      setPending(false);
    }
  }

  async function remove(insert: MusicRadioInsertDto) {
    const question =
      insert.status === "on_air"
        ? `Снять «${insert.title}» с эфира прямо сейчас?`
        : `Удалить вставку «${insert.title}»?`;
    if (!window.confirm(question)) return;
    try {
      await deleteMusicRadioInsert(insert.id);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось удалить");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-4">
        <h2 className="font-display text-base font-bold text-text-0">
          Новая голосовая вставка
        </h2>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Название</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            className={field}
            placeholder="Объявление о фестивале"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {recording ? (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-magenta/40 bg-magenta/10 px-3 text-sm font-semibold text-text-0"
            >
              <Square aria-hidden className="size-4" fill="currentColor" />
              Остановить запись
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startRecording()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-glass-brd px-3 text-sm text-text-1 hover:text-text-0"
            >
              <Mic aria-hidden className="size-4" />
              Записать с микрофона
            </button>
          )}
          <span className="text-xs text-text-2">или</span>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-glass-brd px-3 text-sm text-text-1 hover:text-text-0">
            <Upload aria-hidden className="size-4" />
            {file && !recording ? file.name : "Выбрать файл"}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(event) => {
                const picked = event.target.files?.[0];
                setFile(picked ? { blob: picked, name: picked.name } : null);
              }}
            />
          </label>
        </div>
        {recording && (
          <p role="status" className="text-sm text-magenta">
            Идёт запись…
          </p>
        )}
        {preview && (
          <audio controls src={preview} className="w-full">
            <track kind="captions" />
          </audio>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs text-text-2">Когда в эфир</legend>
          <label className="flex min-h-11 items-center gap-2.5">
            <input
              type="radio"
              name="radio-insert-mode"
              checked={mode === "now"}
              onChange={() => setMode("now")}
              className="size-5"
            />
            <span className="text-sm text-text-0">Сейчас — прервать эфир</span>
          </label>
          <label className="flex min-h-11 flex-wrap items-center gap-2.5">
            <input
              type="radio"
              name="radio-insert-mode"
              checked={mode === "timer"}
              onChange={() => setMode("timer")}
              className="size-5"
            />
            <span className="text-sm text-text-0">По таймеру</span>
            {mode === "timer" && (
              <input
                type="datetime-local"
                value={when}
                onChange={(event) => setWhen(event.target.value)}
                aria-label="Дата и время выхода"
                className={`${field} w-auto`}
              />
            )}
          </label>
        </fieldset>

        <button
          type="button"
          disabled={pending || recording || !file}
          onClick={() => void submit()}
          className="btn-mint min-h-11 self-start rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          {pending
            ? "Отправляем…"
            : mode === "now"
              ? "В эфир сейчас"
              : "Поставить по таймеру"}
        </button>
        {notice && (
          <p role="status" className="text-sm text-text-1">
            {notice}
          </p>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </section>

      <section aria-labelledby="radio-inserts-list">
        <h2
          id="radio-inserts-list"
          className="font-display text-base font-bold text-text-0"
        >
          Вставки
        </h2>
        {inserts.length === 0 ? (
          <p className="mt-2 text-sm text-text-1">Вставок пока не было.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {inserts.map((insert) => (
              <li
                key={insert.id}
                className="glass flex items-center gap-3 rounded-xl border border-glass-brd p-3"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-text-0">
                    {insert.title}
                  </span>
                  <span className="text-xs text-text-2">
                    {[
                      formatWhen(insert.scheduledAt),
                      formatTrackDuration(insert.durationSeconds),
                      STATUS_LABEL[insert.status],
                      insert.createdByName,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void remove(insert)}
                  aria-label={
                    insert.status === "on_air"
                      ? `Снять с эфира «${insert.title}»`
                      : `Удалить «${insert.title}»`
                  }
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
