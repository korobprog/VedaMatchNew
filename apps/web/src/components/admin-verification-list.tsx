"use client";

import { useState } from "react";
import type { AdminVerificationRequest, DevoteeVerificationStatus } from "@vedamatch/shared";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const statusLabels: Record<DevoteeVerificationStatus, string> = {
  self_identified: "Самоопределен",
  awaiting_mentor: "Ожидает наставника",
  mentor_submitted: "Наставник заполнил форму",
  awaiting_admin: "Ожидает администратора",
  confirmed: "Подтверждено",
  rejected: "Отклонено",
  needs_clarification: "Требует уточнения",
};

export function AdminVerificationList({ requests }: { requests: AdminVerificationRequest[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(id: string, status: DevoteeVerificationStatus) {
    const adminNote = window.prompt("Комментарий администратора", "") ?? "";
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/verification-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, adminNote }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить решение");
    } finally {
      setPendingId(null);
    }
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Заявок пока нет.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {requests.map((request) => (
        <article
          key={request.id}
          className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {String(request.userName ?? "Пользователь")}
              </h2>
              <p className="text-sm text-zinc-500">{String(request.userEmail ?? "")}</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              {statusLabels[request.status] ?? request.status}
            </span>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Наставник" value={request.mentorName} />
            <Info label="Телефон" value={request.mentorPhone} />
            <Info label="Email" value={request.mentorEmail} />
            <Info label="Город / община" value={request.cityOrCommunity} />
            <Info label="Как давно знает" value={request.knownDuration} />
            <Info label="Рекомендует" value={formatBoolean(request.recommendsDevoteeStatus)} />
          </dl>

          <details className="mt-4 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-800">
            <summary className="cursor-pointer font-medium text-zinc-900 dark:text-zinc-100">
              Полная карточка заявки
            </summary>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Info label="Знает лично" value={formatBoolean(request.knowsPersonally)} />
              <Info label="Подтверждает регулярную практику" value={formatBoolean(request.confirmsRegularPractice)} />
              <Info label="Подтверждает служение" value={formatBoolean(request.confirmsService)} />
              <Info label="Подтверждает духовное имя" value={formatBoolean(request.confirmsSpiritualName)} />
              <Info label="Подтверждает связь с общиной" value={formatBoolean(request.confirmsCommunityConnection)} />
              <Info label="Рекомендует статус" value={formatBoolean(request.recommendsDevoteeStatus)} />
              <Info label="Создана" value={formatDate(request.createdAt)} />
              <Info label="Обновлена" value={formatDate(request.updatedAt)} />
              <Info label="Форма наставника заполнена" value={formatDate(request.mentorSubmittedAt)} />
              <Info label="Комментарий администратора" value={request.adminNote} />
            </dl>
            <div className="mt-4">
              <p className="mb-1 text-zinc-500">Характеристика пользователя</p>
              <p className="rounded-lg bg-white p-3 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {request.userCharacterReference ? String(request.userCharacterReference) : "?"}
              </p>
            </div>
          </details>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => review(request.id, "confirmed")}
              disabled={pendingId === request.id}
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-zinc-400"
            >
              Подтвердить
            </button>
            <button
              onClick={() => review(request.id, "needs_clarification")}
              disabled={pendingId === request.id}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:bg-zinc-400"
            >
              Уточнить
            </button>
            <button
              onClick={() => review(request.id, "rejected")}
              disabled={pendingId === request.id}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-zinc-400"
            >
              Отклонить
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900 dark:text-zinc-100">
        {value ? String(value) : "?"}
      </dd>
    </div>
  );
}

function formatBoolean(value: boolean | null | undefined) {
  if (value === true) return "Да";
  if (value === false) return "Нет";
  return "?";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "?";
  return new Date(value).toLocaleString("ru-RU");
}
