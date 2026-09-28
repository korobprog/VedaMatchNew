"use client";

import { useId, useState } from "react";
import { getRewardsInviteText, saveRewardsInviteText } from "@/lib/rewards-api";
import type { InviteCopy } from "./quick-action-hooks";
import { inviteDraftState, inviteSaveErrorText } from "./invite-text";

const secondaryButton =
  "rounded-xl border border-glass-brd px-4 py-2 font-body text-sm font-medium text-text-1 hover:bg-bg-2 disabled:opacity-60";
const primaryButton =
  "btn-mint rounded-xl px-4 py-2 font-body text-sm font-medium disabled:opacity-60";

/**
 * Окно горячей кнопки «Пригласить» (VED-618): текст, который только что ушёл
 * в буфер, и — у администратора — его правка на месте. Шаблон один на весь
 * портал и хранится на сервере; личную ссылку в него ставит сервер, поэтому
 * администратор правит шаблон, а видит в окне свой собственный текст.
 *
 * Нативный `<dialog>`: фокус, Esc и затемнение даёт браузер. Без `<form>`:
 * кнопка живёт и внутри меню, а вложенная форма в форме недопустима.
 */
export function InviteSheet({ invite }: { invite: InviteCopy }) {
  const titleId = useId();
  const { sheet, dialogRef } = invite;
  const [editing, setEditing] = useState<{
    draft: string;
    maxLength: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    dialogRef.current?.close();
  }

  function reset() {
    // Закрыли посреди правки — в следующий раз окно откроется с текстом.
    setEditing(null);
    setError(null);
    setBusy(false);
  }

  async function startEdit() {
    setBusy(true);
    setError(null);
    try {
      const current = await getRewardsInviteText();
      setEditing({ draft: current.text, maxLength: current.maxLength });
    } catch {
      setError("Не удалось загрузить текст. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await saveRewardsInviteText({ text: editing.draft });
      await invite.reload();
      setEditing(null);
    } catch (e) {
      setError(inviteSaveErrorText(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }

  const draftState = editing
    ? inviteDraftState(editing.draft, editing.maxLength)
    : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={reset}
      // Esc закрывает только это окно: панель и меню, внутри которых живёт
      // кнопка, слушают Esc на window/document и закрылись бы вместе с ним.
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
      className="m-auto w-[min(92vw,34rem)] rounded-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 shadow-2xl backdrop:bg-black/60"
    >
      {sheet && (
        <div className="p-6 text-left">
          <h2 id={titleId} className="font-display text-xl font-bold">
            {editing ? "Текст приглашения" : "Пригласить"}
          </h2>

          {editing && draftState ? (
            <>
              <label
                htmlFor={`${titleId}-text`}
                className="mt-2 block font-body text-sm text-text-1"
              >
                Шаблон один на весь портал. Личная ссылка приглашающего встанет
                на место <code className="font-mono">{"{ссылка}"}</code>, а без
                него — на место адреса{" "}
                <code className="font-mono">vedamatch.ru</code>; если нет и его,
                допишется в конце. Пустое поле вернёт исходный текст.
              </label>
              <textarea
                id={`${titleId}-text`}
                value={editing.draft}
                onChange={(e) =>
                  setEditing({ ...editing, draft: e.target.value })
                }
                rows={14}
                aria-invalid={draftState.tooLong}
                className="mt-3 block max-h-[55vh] w-full resize-y rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 font-body text-sm leading-relaxed text-text-0"
              />
              <p
                className={`mt-1 text-right font-mono text-xs ${draftState.tooLong ? "text-red-700 dark:text-red-300" : "text-text-1"}`}
              >
                {draftState.length} / {editing.maxLength}
              </p>
            </>
          ) : (
            <>
              <p
                role="status"
                aria-live="polite"
                className="mt-2 font-body text-sm text-text-1"
              >
                {sheet.copied
                  ? "Текст скопирован — вставьте его в переписку."
                  : "Скопировать не вышло — выделите текст вручную."}
              </p>
              {/* Текст целиком: человек отправляет его от своего имени и
                  вправе прочитать, прежде чем вставить. */}
              <p className="mt-3 max-h-[55vh] overflow-y-auto whitespace-pre-line break-words rounded-xl border border-glass-brd bg-bg-2 px-4 py-3 font-body text-sm leading-relaxed text-text-0">
                {sheet.message}
              </p>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-red-100 p-3 font-body text-sm text-red-700 dark:bg-red-950 dark:text-red-200"
            >
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setError(null);
                  }}
                  disabled={busy}
                  className={secondaryButton}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy || draftState?.tooLong}
                  className={primaryButton}
                >
                  {busy ? "Сохраняю…" : "Сохранить"}
                </button>
              </>
            ) : (
              <>
                {sheet.canEdit && (
                  <button
                    type="button"
                    onClick={() => void startEdit()}
                    disabled={busy}
                    className={secondaryButton}
                  >
                    Изменить текст
                  </button>
                )}
                <button
                  type="button"
                  onClick={close}
                  className={secondaryButton}
                >
                  Закрыть
                </button>
                <button
                  type="button"
                  onClick={() => void invite.recopy()}
                  className={primaryButton}
                >
                  Скопировать
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
