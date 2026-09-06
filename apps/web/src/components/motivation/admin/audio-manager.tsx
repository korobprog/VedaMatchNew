"use client";

import { useEffect, useRef, useState } from "react";
import type { MotivationAudioDto } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiRequest } from "../motivation-admin-api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Фоновая музыка Вдохновения — записи, под которые читают шлоки.
 *
 * Редакция загружает файлы, а не заказывает генерацию: спокойный инструментал
 * проще взять готовым, чем описывать промптом. Подложки роликов живут в
 * соседней вкладке и с этими не смешиваются — они вшиваются внутрь видео.
 *
 * Выключение вместо удаления — обычный случай: запись убирают из ленты на
 * время, а файл остаётся. Удаление рядом, но отдельной кнопкой.
 */
export function MotivationAudioManager({
  initial,
}: {
  initial: MotivationAudioDto[];
}) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setItems(initial), [initial]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await apiFetch(`${API_URL}/admin/motivation/audio`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw new Error(await response.text());
      const saved = (await response.json()) as MotivationAudioDto;
      setItems((current) => [...current, saved]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Не удалось загрузить запись",
      );
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Partial<MotivationAudioDto>) {
    setError(null);
    try {
      const saved = (await apiRequest(
        `/admin/motivation/audio/${id}`,
        "PATCH",
        body,
      )) as MotivationAudioDto;
      setItems((current) =>
        current.map((item) => (item.id === id ? saved : item)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не вышло сохранить");
    }
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Удалить запись «${title}»?`)) return;
    setError(null);
    try {
      await apiRequest(`/admin/motivation/audio/${id}`, "DELETE");
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не вышло удалить");
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-glass-brd bg-glass p-4">
        <h2 className="font-display text-lg font-semibold text-text-0">
          Фон для чтения
        </h2>
        <p className="mt-1 text-sm text-text-1">
          Спокойные записи, которые читатель включает кнопкой в ленте. Играют по
          кругу и негромко: это фон, а не концерт. Принимаем mp3, m4a и ogg до
          20 МБ.
        </p>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 hover:text-cyan">
          <input
            ref={fileRef}
            type="file"
            accept="audio/mpeg,audio/mp4,audio/ogg,.mp3,.m4a,.ogg"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          {busy ? "Загружаем…" : "Загрузить запись"}
        </label>
        {error && (
          <p role="alert" className="mt-2 text-sm text-magenta">
            {error}
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-text-2">
          Пока ни одной записи. Читатель увидит кнопку музыки только после
          первой включённой — молчащая кнопка хуже её отсутствия.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-glass-brd bg-bg-1 p-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-0">
                  {item.title}
                </span>
                {/* Прослушать прямо здесь: иначе «что это за файл» проверяют
                    в ленте, где он играет фоном под чужой цитатой. */}
                <audio
                  src={item.url}
                  controls
                  preload="none"
                  className="mt-2 w-full max-w-sm"
                />
              </span>
              <label className="flex items-center gap-2 text-sm text-text-1">
                <input
                  type="checkbox"
                  checked={item.isActive}
                  onChange={(event) =>
                    void patch(item.id, { isActive: event.target.checked })
                  }
                />
                В ленте
              </label>
              <button
                type="button"
                onClick={() => void remove(item.id, item.title)}
                className="rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-2 hover:text-magenta"
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
