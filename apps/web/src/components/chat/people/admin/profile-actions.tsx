"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONTACTS_HIDE_REASON_MIN_LENGTH,
  type ContactsProfileStatus,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import {
  hideContactsProfile,
  restoreContactsProfile,
} from "@/lib/chat-people-admin-api";

/**
 * Снять карточку со справочника или вернуть. Меняется статус, а не видимость:
 * видимость выбирает сам человек, и перезаписать её значило бы стереть его
 * настройку без следа.
 */
export function PeopleProfileActions({
  userId,
  status,
}: {
  userId: string;
  status: ContactsProfileStatus;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hidden = status !== "active";

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

  return (
    <div className="mt-3 border-t border-glass-brd pt-3">
      {error && (
        <Alert tone="error" className="mb-2">
          {error}
        </Alert>
      )}
      {hidden ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => void run(() => restoreContactsProfile(userId))}
          className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          Вернуть в справочник
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="причина снятия"
            className="w-64 max-w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-1.5 text-sm text-text-0 placeholder:text-text-2"
          />
          <button
            type="button"
            disabled={
              pending || reason.trim().length < CONTACTS_HIDE_REASON_MIN_LENGTH
            }
            onClick={() =>
              void run(() =>
                hideContactsProfile(userId, { reason: reason.trim() }),
              )
            }
            className="rounded-xl border border-magenta/50 px-3 py-1.5 text-sm text-text-0 hover:bg-magenta/10 disabled:opacity-50"
          >
            Снять со справочника
          </button>
        </div>
      )}
    </div>
  );
}
