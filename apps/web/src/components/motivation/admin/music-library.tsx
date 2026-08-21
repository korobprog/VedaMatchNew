"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MotivationTrackDto } from "@vedamatch/shared";
import { apiRequest } from "../motivation-admin-api";
import {
  cardClass,
  fieldClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "./ui";

const STATUS_LABEL: Record<MotivationTrackDto["status"], string> = {
  draft: "Черновик",
  approved: "Принят",
  rejected: "Отклонён",
};

/**
 * Библиотека музыкальных подложек.
 *
 * Трек создаётся один раз и играет во множестве роликов, поэтому генерация —
 * отдельное действие редакции, а не часть пайплайна. Промпт пишет наш ИИ по
 * пожеланию своими словами: музыкальная модель слушается инструментовки и
 * регистра, а не прилагательных, и формулировать это вручную тяжело.
 */
export function MusicLibrary({
  tracks,
  defaultTrackId,
}: {
  tracks: MotivationTrackDto[];
  defaultTrackId: string | null;
}) {
  const router = useRouter();
  const [mood, setMood] = useState("");
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [seconds, setSeconds] = useState(20);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function run(action: string, work: () => Promise<unknown>) {
    setBusy(action);
    setError(undefined);
    try {
      await work();
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Не получилось",
      );
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className={cardClass}>
      <h2 className="mb-1 font-display text-lg font-semibold text-text-0">
        Музыкальная подложка
      </h2>
      <p className="mb-4 text-xs text-text-2">
        Трек генерируется один раз и играет во множестве роликов. В ленту
        попадает только принятый.
      </p>

      <div className="grid gap-3">
        <label className={labelClass}>
          Опишите словами, каким должен быть звук
          <textarea
            rows={2}
            value={mood}
            onChange={(event) => setMood(event.target.value)}
            placeholder="Например: звук раковины, приближение к чему-то важному, без развязки"
            className={`mt-2 ${fieldClass}`}
          />
        </label>
        <div>
          <button
            type="button"
            disabled={busy === "draft"}
            onClick={() =>
              void run("draft", async () => {
                const result = (await apiRequest(
                  "/admin/motivation/tracks/draft-prompt",
                  "POST",
                  { mood },
                )) as { prompt?: string } | null;
                if (result?.prompt) setPrompt(result.prompt);
              })
            }
            className={secondaryButton}
          >
            {busy === "draft" ? "Сочиняем…" : "Сочинить промпт"}
          </button>
          <span className="ml-3 text-xs text-text-2">
            Без описания получится общая подложка — текст выше её уточняет.
          </span>
        </div>

        <label className={labelClass}>
          Промпт для музыкальной модели
          <textarea
            rows={5}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className={`mt-2 ${fieldClass} font-mono text-xs`}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className={labelClass}>
            Название
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={`mt-2 ${fieldClass}`}
            />
          </label>
          <label className={labelClass}>
            Секунд
            <input
              type="number"
              min={10}
              max={60}
              value={seconds}
              onChange={(event) => setSeconds(Number(event.target.value))}
              className={`mt-2 ${fieldClass} sm:w-24`}
            />
          </label>
          <button
            type="button"
            disabled={busy === "generate" || !prompt.trim()}
            onClick={() =>
              void run("generate", () =>
                apiRequest("/admin/motivation/tracks", "POST", {
                  title,
                  prompt,
                  seconds,
                }),
              )
            }
            className={primaryButton}
          >
            {busy === "generate" ? "Создаём…" : "Создать трек"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-500">
          {error}
        </p>
      )}

      <ul className="mt-6 grid gap-3">
        {tracks.length === 0 && (
          <li className="text-sm text-text-2">Треков пока нет.</li>
        )}
        {tracks.map((track) => (
          <li
            key={track.id}
            className="rounded-xl border border-glass-brd p-3 sm:p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-text-0">
                {track.title}
                {track.id === defaultTrackId && (
                  <span className="ml-2 rounded-full bg-cyan/15 px-2 py-0.5 text-xs text-cyan">
                    по умолчанию
                  </span>
                )}
              </span>
              <span className="text-xs text-text-2">
                {STATUS_LABEL[track.status]} · {track.seconds} с
              </span>
            </div>

            {/* Слушать до приёмки обязательно: сгенерированное никто не
                проверял, а в ленту оно пойдёт под цитатой из писания. */}
            <audio
              src={track.url}
              controls
              preload="none"
              className="mt-3 w-full"
            />

            <details className="mt-2">
              <summary className="flex min-h-11 cursor-pointer items-center text-xs text-text-2">
                Промпт
              </summary>
              <p className="mt-1 font-mono text-xs leading-5 text-text-1">
                {track.prompt}
              </p>
            </details>

            <div className="mt-3 flex flex-wrap gap-2">
              {track.status !== "approved" && (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(track.id, () =>
                      apiRequest(
                        `/admin/motivation/tracks/${track.id}/status`,
                        "POST",
                        { status: "approved" },
                      ),
                    )
                  }
                  className={secondaryButton}
                >
                  Принять
                </button>
              )}
              {track.status === "approved" && track.id !== defaultTrackId && (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(track.id, () =>
                      apiRequest("/admin/motivation/settings", "PATCH", {
                        defaultTrackId: track.id,
                      }),
                    )
                  }
                  className={secondaryButton}
                >
                  Сделать основным
                </button>
              )}
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run(track.id, () =>
                    apiRequest(
                      `/admin/motivation/tracks/${track.id}`,
                      "DELETE",
                    ),
                  )
                }
                className={secondaryButton}
              >
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
