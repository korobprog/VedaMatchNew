"use client";

import { FormEvent, useState } from "react";
import type { AdminPurgeUserResponse } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const countLabels: Record<string, string> = {
  photos: "фотографий",
  listings: "объявлений Маркета",
  notices: "объявлений на доске",
};

/**
 * Безвозвратное удаление. В отличие от соседней формы мягкого удаления,
 * восстановления после этой кнопки не существует: сносится строка User, все
 * сервисные данные каскадом и файлы в хранилище. Поэтому подтверждение —
 * не галочка, а точный ввод email аккаунта.
 */
export function AdminUserPurgeForm({
  userId,
  email,
  isSelf,
}: {
  userId: string;
  email: string;
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmSelfDelete, setConfirmSelfDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<AdminPurgeUserResponse | null>(null);

  const emailMatches =
    confirmEmail.trim().toLowerCase() === email.trim().toLowerCase();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/purge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, confirmEmail, confirmSelfDelete }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDone((await res.json()) as AdminPurgeUserResponse);
      // Ни refresh, ни переход: карточки этого пользователя больше нет, и её
      // перечитывание упиралось в 404, роняя страницу «Страница не открылась».
      // Остаёмся на месте — в сводке ниже счётчик файлов, которые не удалось
      // снести из хранилища, и администратор обязан его увидеть.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить аккаунт");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    const removed = Object.entries(done.counts).filter(([, value]) => value > 0);
    return (
      <div className="space-y-2 rounded-2xl border border-red-400/40 bg-red-400/10 p-4">
        <h3 className="font-semibold text-text-0">Аккаунт удалён безвозвратно</h3>
        <p className="text-sm text-text-1">{done.email}</p>
        {removed.length > 0 && (
          <p className="text-sm text-text-1">
            Снесено:{" "}
            {removed
              .map(([key, value]) => `${value} ${countLabels[key] ?? key}`)
              .join(", ")}
          </p>
        )}
        <p className="text-sm text-text-1">
          Файлов удалено из хранилища: {done.storageObjects}
          {done.storageFailures > 0 && `, не удалось: ${done.storageFailures}`}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="space-y-3 rounded-2xl border border-red-400/40 bg-red-400/10 p-4">
        <h3 className="font-semibold text-red-500">Безвозвратное удаление</h3>
        <p className="text-sm text-text-1">
          Сносит аккаунт и все его данные во всех сервисах: профили Union и
          Контактов, магазин Маркета с объявлениями и заказами, объявления на
          доске, статьи и комментарии Библиотеки, членство в общинах, галерею и
          файлы в хранилище. Восстановить будет нечего.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl border border-red-400/60 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-400/10"
        >
          Удалить безвозвратно
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-red-400/40 bg-red-400/10 p-4"
    >
      <h3 className="font-semibold text-red-500">Безвозвратное удаление</h3>
      {error && (
        <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <label className="block text-sm font-medium text-text-1">
        Причина удаления
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-text-0"
          placeholder="Минимум 5 символов"
        />
      </label>
      <label className="block text-sm font-medium text-text-1">
        Введите <span className="font-mono text-text-0">{email}</span> для подтверждения
        <input
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 font-mono text-text-0"
        />
      </label>
      {isSelf && (
        <label className="flex gap-2 text-sm text-red-600 dark:text-red-300">
          <input
            type="checkbox"
            checked={confirmSelfDelete}
            onChange={(e) => setConfirmSelfDelete(e.target.checked)}
          />
          Я понимаю, что безвозвратно удаляю собственный аккаунт.
        </label>
      )}
      <div className="flex gap-2">
        <button
          disabled={
            pending ||
            reason.trim().length < 5 ||
            !emailMatches ||
            (isSelf && !confirmSelfDelete)
          }
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-600/90 disabled:bg-zinc-400"
        >
          {pending ? "Удаляем…" : "Удалить безвозвратно"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
