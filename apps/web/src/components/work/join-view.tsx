"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { WorkInvitePreviewDto, WorkMemberRole } from "@vedamatch/shared";
import { acceptWorkInvite, previewWorkInvite } from "@/lib/work-api";

const ROLE_TITLE: Record<WorkMemberRole, string> = {
  owner: "владельцем",
  admin: "администратором",
  member: "участником",
  viewer: "наблюдателем",
};

const ROLE_NOTE: Record<WorkMemberRole, string> = {
  owner: "Полные права на среду.",
  admin: "Сможете заводить доски и звать людей.",
  member: "Сможете вести задачи и обсуждать их.",
  viewer: "Сможете смотреть доски, но не менять их.",
};

/**
 * Экран приглашения. Открыт и тому, кто ещё не вошёл: человек должен видеть,
 * куда его зовут, до того как заводить аккаунт. Гостя портал уводит на вход и
 * возвращает сюда же — этим занимается proxy.ts по `returnTo`.
 */
export function WorkJoinView({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<WorkInvitePreviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    previewWorkInvite(token)
      .then(setPreview)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "Приглашение не открылось",
        ),
      );
  }, [token]);

  async function accept() {
    setBusy(true);
    try {
      const { spaceId } = await acceptWorkInvite(token);
      router.replace(`/work/planner/${spaceId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось войти");
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl glass p-6">
        <h1 className="font-display text-xl font-bold text-text-0">
          Приглашение не действует
        </h1>
        <p role="alert" className="mt-2 text-sm text-text-1">
          {error}
        </p>
      </div>
    );
  }

  if (!preview) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-2">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Открываем приглашение…
      </p>
    );
  }

  return (
    <div className="rounded-2xl glass p-6">
      <p className="text-sm text-text-2">Приглашение в рабочую среду</p>
      <h1 className="mt-1 font-display text-2xl font-bold text-text-0">
        {preview.spaceName}
      </h1>
      <p className="mt-2 text-sm text-text-1">
        {preview.invitedBy ? `${preview.invitedBy} зовёт вас ` : "Вас зовут "}
        {ROLE_TITLE[preview.role]}. {ROLE_NOTE[preview.role]}
      </p>
      <p className="mt-1 text-sm text-text-2">
        Сейчас в среде: {preview.memberCount}. Ссылка действует до{" "}
        {new Date(preview.expiresAt).toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "long",
        })}
        .
      </p>

      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="mt-5 rounded-xl bg-magenta px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy
          ? "Заходим…"
          : preview.alreadyMember
            ? "Открыть доску"
            : "Принять приглашение"}
      </button>
    </div>
  );
}
