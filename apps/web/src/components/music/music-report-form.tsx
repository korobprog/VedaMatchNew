"use client";

import { useState } from "react";
import type { MusicReportKind } from "@vedamatch/shared";
import { reportMusicTrack } from "@/lib/music-client-api";
import { Alert } from "@/components/ui/alert";

/**
 * Жалоба на запись.
 *
 * Первый рубеж модерации — слушатели: чужой концерт или битый файл они
 * заметят раньше, чем единственный администратор дойдёт до очереди. Три
 * обычные жалобы скрывают запись, одна о нарушении прав — сразу.
 *
 * Форма спрятана за кнопкой и не открыта по умолчанию: жалоба — не то
 * действие, которое стоит предлагать первым делом на странице записи.
 * Объяснение обязательно: «пожаловался и ушёл» не даёт редакции ничего.
 */
const KINDS: { value: MusicReportKind; label: string; hint: string }[] = [
  {
    value: "copyright",
    label: "Нарушение прав",
    hint: "Это чужая запись, выложенная без разрешения",
  },
  {
    value: "content",
    label: "Не то содержание",
    hint: "Не музыка, не тот раздел, посторонняя запись",
  },
  { value: "quality", label: "Плохое качество", hint: "Обрыв, шум, тишина" },
];

export function MusicReportForm({ trackId }: { trackId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MusicReportKind>("content");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setPending(true);
    setError(null);
    try {
      const result = await reportMusicTrack({ trackId, kind, text: text.trim() });
      setDone(
        result.alreadyReported
          ? "Вы уже жаловались на эту запись — второй раз она не считается."
          : result.hidden
            ? "Записи в каталоге больше нет, её посмотрит редакция."
            : "Жалоба принята. Редакция посмотрит её вместе с остальными.",
      );
      setOpen(false);
      setText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отправить");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6">
        <Alert tone="info">{done}</Alert>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 h-8 rounded-lg border border-glass-brd px-3 text-xs font-semibold text-text-2 hover:text-text-0"
      >
        Пожаловаться на запись
      </button>
    );
  }

  return (
    <section className="glass mt-6 rounded-2xl border border-glass-brd p-4">
      <h2 className="font-display text-base font-bold text-text-0">
        Что не так с записью
      </h2>

      <div className="mt-3 flex flex-col gap-2">
        {KINDS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-glass"
          >
            <input
              type="radio"
              name="kind"
              checked={kind === option.value}
              onChange={() => setKind(option.value)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span className="flex flex-col">
              <span className="text-sm text-text-0">{option.label}</span>
              <span className="text-xs text-text-2">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs text-text-2">
          Объясните — без этого редакции не с чем работать
        </span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-glass-brd bg-bg-1 p-2.5 text-sm text-text-0"
        />
      </label>

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={() => void send()}
          className="h-9 rounded-xl border border-magenta/50 px-4 text-sm font-semibold text-magenta disabled:opacity-40"
        >
          {pending ? "Отправляем…" : "Пожаловаться"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-1"
        >
          Отмена
        </button>
      </div>
    </section>
  );
}
