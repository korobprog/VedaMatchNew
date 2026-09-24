"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

/**
 * Убрать фото профиля (VED-471): снимок, который нельзя показывать, а сам
 * человек его не убирает. Раньше удалить фото мог только владелец, и
 * администрации оставалось либо просить его, либо лезть в базу.
 *
 * Пояснение необязательно, но уходит человеку в уведомлении «Администрация
 * изменила ваш профиль» и в журнал: без него пропавшее фото выглядит как сбой.
 */
export function AdminUserAvatarRemove({
  userId,
  avatarUrl,
}: {
  userId: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!avatarUrl) {
    return <p className="text-sm text-text-1">Фото профиля не загружено.</p>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Файл удаляется из хранилища насовсем — вернуть его может только сам
    // человек, загрузив заново.
    if (!window.confirm("Удалить фото профиля? Вернуть его будет нельзя.")) {
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(
        `${API_URL}/admin/users/${userId}/avatar/remove`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() || undefined }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить фото");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl}
        alt="Фото профиля"
        className="size-32 rounded-2xl border border-glass-brd object-cover"
      />
      <label className="block text-sm text-text-1">
        Пояснение для человека (необязательно)
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={300}
          placeholder="Например: на фото другой человек"
          className="mt-1 block w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border border-magenta/40 px-4 py-2 text-sm font-medium text-magenta hover:bg-magenta/10 disabled:opacity-50"
      >
        {pending ? "Удаляем…" : "Удалить фото профиля"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      )}
    </form>
  );
}
