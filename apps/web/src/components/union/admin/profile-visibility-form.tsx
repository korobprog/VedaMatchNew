"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { UNION_ADMIN_HIDE_REASON_MIN_LENGTH } from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { hideUnionProfile, restoreUnionProfile } from "@/lib/union-admin-api";

/**
 * Снять анкету с выдачи или вернуть. Промежуточный рычаг между «ничего» и
 * блокировкой аккаунта: человек продолжает пользоваться порталом, но в колоде
 * знакомств не показывается.
 */
export function UnionProfileVisibilityForm({
  userId,
  isActive,
}: {
  userId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить");
    } finally {
      setPending(false);
    }
  }

  async function hide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(() => hideUnionProfile(userId, { reason: reason.trim() }));
  }

  if (!isActive) {
    return (
      <div className="space-y-3 rounded-2xl border border-magenta/30 bg-magenta/5 p-4">
        <h2 className="font-display font-semibold text-text-0">Видимость</h2>
        <p className="text-sm text-text-1">
          Анкета снята с выдачи и не показывается в рекомендациях.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <Button
          type="button"
          loading={pending}
          onClick={() => void run(() => restoreUnionProfile(userId))}
        >
          Вернуть в выдачу
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={hide}
      className="space-y-3 rounded-2xl border border-magenta/30 bg-magenta/5 p-4"
    >
      <div>
        <h2 className="font-display font-semibold text-text-0">Видимость</h2>
        <p className="mt-1 text-sm text-text-1">
          Анкета перестанет показываться в рекомендациях. Аккаунт и остальные
          сервисы портала это не затрагивает.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <label className="block text-sm font-medium text-text-1">
        Причина
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="что не так с анкетой"
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
      </label>
      <Button
        type="submit"
        loading={pending}
        disabled={reason.trim().length < UNION_ADMIN_HIDE_REASON_MIN_LENGTH}
      >
        Снять с выдачи
      </Button>
    </form>
  );
}
