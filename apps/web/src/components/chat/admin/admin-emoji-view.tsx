"use client";

import { useState } from "react";
import {
  CHAT_FAVORITE_EMOJI_MAX,
  type ChatFavoriteEmojisDto,
  type UpdateChatFavoriteEmojisRequest,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { API_URL, apiFetch } from "@/lib/http-client";
import { ChatEmojiPicker } from "../chat-emoji-picker";
import { toggleFavoriteEmoji } from "../favorite-emojis";

/**
 * «Избранные» смайлики по умолчанию (VED-123). Этот набор видят в панели
 * смайликов все, кто не собрал свой. Правка — черновиком: сначала собрать,
 * потом «Сохранить», чтобы случайное нажатие не меняло панель у всех сразу.
 */
export function AdminEmojiView({ initial }: { initial: ChatFavoriteEmojisDto | null }) {
  const [saved, setSaved] = useState<ChatFavoriteEmojisDto | null>(initial);
  const [draft, setDraft] = useState<string[]>(initial?.emojis ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!saved) {
    return <Alert tone="error">Не удалось загрузить набор смайликов.</Alert>;
  }

  const changed = draft.join(" ") !== saved.emojis.join(" ");

  async function save(emojis: string[]) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body: UpdateChatFavoriteEmojisRequest = { emojis };
      const res = await apiFetch(`${API_URL}/admin/chat/emoji`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          message?: unknown;
        } | null;
        throw new Error(
          typeof payload?.message === "string"
            ? payload.message
            : "Набор не сохранился",
        );
      }
      const next = (await res.json()) as ChatFavoriteEmojisDto;
      setSaved(next);
      setDraft(next.emojis);
      setNotice(
        next.isBuiltIn ? "Вернули встроенный набор" : "Набор сохранён",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Набор не сохранился");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-glass-brd bg-glass p-4">
        <h2 className="font-display text-base font-semibold text-text-0">
          Набор по умолчанию
        </h2>
        <p className="mt-1 text-sm text-text-1">
          Первая категория в панели смайликов у всех, кто не собрал свой набор.
          {saved.isBuiltIn && " Сейчас показывается встроенный набор."} Не
          больше {CHAT_FAVORITE_EMOJI_MAX}.
        </p>

        {draft.length > 0 ? (
          <ul aria-label="Смайлики набора" className="mt-3 flex flex-wrap gap-1.5">
            {draft.map((emoji) => (
              <li key={emoji}>
                <button
                  type="button"
                  onClick={() => setDraft((list) => list.filter((item) => item !== emoji))}
                  aria-label={`Убрать ${emoji}`}
                  title="Убрать"
                  className="flex size-10 items-center justify-center rounded-xl border border-glass-brd bg-bg-1 text-2xl leading-none hover:border-magenta"
                >
                  {emoji}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-text-2">
            Пусто — после сохранения у всех будет встроенный набор.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void save(draft)}
            disabled={busy || !changed}
            className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Сохраняем…" : "Сохранить"}
          </button>
          {changed && (
            <button
              type="button"
              onClick={() => setDraft(saved.emojis)}
              disabled={busy}
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0"
            >
              Отменить правку
            </button>
          )}
          {!saved.isBuiltIn && (
            <button
              type="button"
              onClick={() => void save([])}
              disabled={busy}
              className="rounded-xl px-2 py-2 text-sm font-medium text-text-2 underline-offset-2 hover:text-text-0 hover:underline"
            >
              Вернуть встроенный набор
            </button>
          )}
        </div>
        {notice && (
          <p role="status" className="mt-2 text-sm text-text-1">
            {notice}
          </p>
        )}
        {error && (
          <Alert tone="error" className="mt-3">
            {error}
          </Alert>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-base font-semibold text-text-0">
          Добавить в набор
        </h2>
        <p className="mb-2 text-sm text-text-1">
          Нажмите на смайлик — он встанет в конец набора, повторное нажатие
          уберёт его.
        </p>
        <div className="max-w-md">
          <ChatEmojiPicker
            label="Выбрать смайлик для набора"
            onPick={(emoji) => setDraft((list) => toggleFavoriteEmoji(list, emoji))}
          />
        </div>
      </section>
    </div>
  );
}
