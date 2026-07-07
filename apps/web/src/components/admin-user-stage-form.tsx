"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { DevoteeVerificationStatus, SpiritualStage } from "@vedamatch/shared";
import { stageLabels, verificationLabels } from "@/lib/admin-labels";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const stages: SpiritualStage[] = ["seeker", "practitioner", "yogi", "devotee"];
const statuses: DevoteeVerificationStatus[] = [
  "self_identified",
  "awaiting_mentor",
  "mentor_submitted",
  "awaiting_admin",
  "confirmed",
  "rejected",
  "needs_clarification",
];

export function AdminUserStageForm({
  userId,
  isSelf,
  initialStage,
  initialStatus,
}: {
  userId: string;
  isSelf: boolean;
  initialStage: SpiritualStage | null;
  initialStatus: DevoteeVerificationStatus | null;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<SpiritualStage>(initialStage ?? "seeker");
  const [status, setStatus] = useState<DevoteeVerificationStatus>(
    initialStatus ?? "self_identified",
  );
  const [reason, setReason] = useState("");
  const [confirmSelfChange, setConfirmSelfChange] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const nextStatus = stage === "devotee" ? status : null;
    const confirmationDropsStatus =
      initialStatus === "confirmed" && nextStatus !== "confirmed";

    if (confirmationDropsStatus) {
      const ok = window.confirm(
        "Вы сбрасываете подтверждённый статус. Доступ к закрытым сервисам может измениться. Продолжить?",
      );
      if (!ok) return;
    }

    setPending(true);
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/stage`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spiritualStage: stage,
          devoteeVerificationStatus: nextStatus,
          reason,
          confirmSelfChange,
          confirmStatusDowngrade: confirmationDropsStatus,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить изменение");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Ручное изменение этапа</h3>
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Духовный этап
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as SpiritualStage)}
            className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {stages.map((item) => (
              <option key={item} value={item}>{stageLabels[item]}</option>
            ))}
          </select>
        </label>
        {stage === "devotee" && (
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Статус подтверждения
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DevoteeVerificationStatus)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {statuses.map((item) => (
                <option key={item} value={item}>{verificationLabels[item]}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Причина изменения
        <textarea
          required
          minLength={5}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 min-h-24 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="Например: подтверждено после проверки заявки наставника"
        />
      </label>
      {isSelf && (
        <label className="flex gap-2 text-sm text-red-700 dark:text-red-200">
          <input
            type="checkbox"
            checked={confirmSelfChange}
            onChange={(e) => setConfirmSelfChange(e.target.checked)}
          />
          Я понимаю, что меняю собственный профиль администратора.
        </label>
      )}
      <button
        disabled={pending || (isSelf && !confirmSelfChange)}
        className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:bg-zinc-400"
      >
        {pending ? "Сохраняем…" : "Сохранить изменение"}
      </button>
    </form>
  );
}
