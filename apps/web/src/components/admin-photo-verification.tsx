"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PhotoVerificationState } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const statusLabels: Record<PhotoVerificationState["status"], string> = {
  none: "Проверка не запрашивалась",
  requested: "Заявка ожидает решения",
  verified: "Фото проверены",
};

export function AdminPhotoVerification({
  userId,
  state,
}: {
  userId: string;
  state: PhotoVerificationState;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(verified: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(
        `${API_URL}/admin/users/${userId}/photo-verification`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verified }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить статус");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-1">
        {statusLabels[state.status]}
        {state.requestedAt &&
          ` · заявка от ${new Date(state.requestedAt).toLocaleString("ru-RU")}`}
        {state.verifiedAt &&
          ` · подтверждено ${new Date(state.verifiedAt).toLocaleString("ru-RU")}`}
      </p>
      <p className="text-xs text-text-2">
        Значок снимается автоматически, если пользователь изменит состав фото.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || state.status === "verified"}
          onClick={() => set(true)}
          className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Подтвердить фото
        </button>
        <button
          type="button"
          disabled={pending || state.status === "none"}
          onClick={() => set(false)}
          className="rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          Снять проверку
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
