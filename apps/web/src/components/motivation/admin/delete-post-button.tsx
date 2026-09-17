"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { RunCommand } from "./use-admin-command";
import { dangerButton, secondaryButton } from "./ui";

/**
 * Удаление в два нажатия. Отдельного диалога нет намеренно: `confirm()` в
 * мобильном Safari перехватывается блокировщиком всплывающих окон, а модалка
 * ради одной кнопки — лишний слой.
 */
export function DeletePostButton({
  postId,
  title,
  isPublished,
  pendingAction,
  run,
}: {
  postId: string;
  title: string;
  isPublished: boolean;
  pendingAction: string | undefined;
  run: RunCommand;
}) {
  const [armed, setArmed] = useState(false);
  const disabled = pendingAction !== undefined;

  if (!armed)
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setArmed(true)}
        aria-label={`Удалить «${title}»`}
        className={dangerButton}
      >
        <Trash2 className="h-4 w-4" />
        Удалить
      </button>
    );

  return (
    <DeletePostConfirm
      postId={postId}
      isPublished={isPublished}
      pendingAction={pendingAction}
      run={run}
      onCancel={() => setArmed(false)}
    />
  );
}

/**
 * Второе нажатие — само подтверждение. Отдельно от кнопки для карточки
 * опубликованного (VED-199): там кнопка — квадрат в ряду значков, и
 * вопрос с двумя кнопками в её клетку не помещается — он встаёт под
 * карточкой во всю ширину.
 */
export function DeletePostConfirm({
  postId,
  isPublished,
  pendingAction,
  run,
  onCancel,
}: {
  postId: string;
  isPublished: boolean;
  pendingAction: string | undefined;
  run: RunCommand;
  onCancel: () => void;
}) {
  const disabled = pendingAction !== undefined;
  return (
    <div className="w-full rounded-xl border border-red-400/40 bg-red-500/10 p-3">
      <p className="text-sm text-text-0">
        Удалить вдохновение вместе с цитатой?
        {isPublished && " Она пропадёт из ленты и из избранного у пользователей."}
        {" "}
        Отменить нельзя.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            run(postId, "delete", {
              path: `/admin/motivation/posts/${postId}`,
              method: "DELETE",
            })
          }
          className={dangerButton}
        >
          {pendingAction === "delete" ? "Удаление…" : "Да, удалить"}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className={secondaryButton}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
