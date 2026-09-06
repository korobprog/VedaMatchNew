"use client";

import { useState } from "react";
import type { ChatMomentSettingsState } from "@vedamatch/shared";
import { saveChatMomentSettings } from "@/lib/chat-moments-api";

/**
 * Галочка «видно всем на портале».
 *
 * Возможность платная, но в бете открыта каждому — поэтому она здесь, а не
 * за замком с предложением оплатить: пока портал бесплатен, показывать замок
 * не за что. Когда режим переключат, недоступная галочка объяснит словами,
 * почему она погасла, и уже опубликованное останется видно собеседникам.
 */
export function MomentsSettings({ initial }: { initial: ChatMomentSettingsState }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      setState(await saveChatMomentSettings({ showToEveryone: next }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не сохранилось");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-3xl border border-glass-brd bg-glass p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={state.showToEveryone}
          disabled={busy || !state.everyoneAllowed}
          onChange={(event) => void toggle(event.target.checked)}
          className="mt-0.5 size-4 accent-[var(--vm-magenta)]"
        />
        <span className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-text-0">
            Показывать моменты всему порталу
          </span>
          <span className="text-xs leading-4 text-text-1">
            Без галочки моменты видят те, кому вы открыли активность, и ваши
            собеседники. С галочкой — любой, кто зашёл на портал.
          </span>
        </span>
      </label>
      {state.planNote && <p className="text-xs text-text-2">{state.planNote}</p>}
      {error && <p className="text-xs text-magenta">{error}</p>}
    </section>
  );
}
