"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * «Удалить» на своём рилсе — в студии, а не в ленте.
 *
 * В ленте кнопке места нет: ряд внизу кадра и без неё держит семь позиций и
 * ровно на седьмой начинает слипаться. А приходят удалять не во время
 * листания — приходят к списку своих работ, где видно, что именно удаляешь.
 *
 * Подтверждение в два нажатия тем же приёмом, что в админке
 * (`admin/delete-post-button.tsx`): `confirm()` в мобильном Safari
 * перехватывается блокировщиком всплывающих окон, а модалка ради одной
 * кнопки — лишний слой. Дублируем сознательно: свой компонент сервиса не
 * должен тянуть админский.
 */
export function DeleteOwnReelButton({
  postId,
  published,
}: {
  postId: string;
  /** Опубликованный уходит и из ленты, и из чужого избранного — об этом надо сказать до нажатия. */
  published: boolean;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${API_URL}/motivation/posts/${postId}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) throw new Error(await response.text());
      // Список страницы серверный: без обновления удалённая карточка осталась
      // бы на экране до перезагрузки — и человек нажал бы «удалить» второй раз.
      router.refresh();
      setArmed(false);
    } catch {
      setError("Не удалось удалить. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  if (!armed)
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-glass-brd px-3 py-1.5 text-xs font-semibold text-text-2 transition-colors hover:text-magenta"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Удалить
      </button>
    );

  return (
    <div className="rounded-xl border border-magenta/40 bg-magenta/10 p-3">
      <p className="text-sm text-text-0">
        Удалить этот афоризм?
        {published &&
          " Он пропадёт из ленты и из избранного у тех, кто его сохранил."}{" "}
        Отменить нельзя.
      </p>
      {error && <p className="mt-2 text-xs text-magenta">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void remove()}
          className="rounded-xl border border-magenta/50 bg-magenta/20 px-3 py-1.5 text-xs font-semibold text-text-0 disabled:opacity-60"
        >
          {pending ? "Удаляем…" : "Да, удалить"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setArmed(false)}
          className="rounded-xl border border-glass-brd px-3 py-1.5 text-xs font-semibold text-text-1"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
