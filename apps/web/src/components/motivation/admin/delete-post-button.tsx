"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { MotivationPostStatus } from "@vedamatch/shared";
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
  status,
  pendingAction,
  run,
}: {
  postId: string;
  title: string;
  /** Статус поста — от него зависит, о чём предупредить перед удалением. */
  status: MotivationPostStatus;
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
      status={status}
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
  status,
  pendingAction,
  run,
  onCancel,
}: {
  postId: string;
  status: MotivationPostStatus;
  pendingAction: string | undefined;
  run: RunCommand;
  onCancel: () => void;
}) {
  const disabled = pendingAction !== undefined;
  /* Раньше был один флаг `isPublished`: пост со статусом `hidden` считался
     «не опубликован», и удаление скрытой (после публикации) карточки
     проходило без единого слова про избранное — хотя скрыть и удалить не
     одно и то же, и люди, сохранившие карточку, теряют её так же безвозвратно
     (VED-251, разбор оценщика). `inFeed` — предупреждение про ленту: у
     скрытого поста его уже нет в ленте, врать об этом не нужно.
     `everFavorited` — предупреждение про избранное: доступно и
     опубликованному, и скрытому, — скрытие не отменяет того, что пост уже
     был `published` и его успели сохранить, пока он был на виду. */
  const inFeed = status === "published";
  const everFavorited = status === "published" || status === "hidden";
  return (
    <div className="w-full rounded-xl border border-red-400/40 bg-red-500/10 p-3">
      <p className="text-sm text-text-0">
        Удалить вдохновение вместе с цитатой?
        {inFeed && " Она пропадёт из ленты и из избранного у пользователей."}
        {!inFeed &&
          everFavorited &&
          " Она уже скрыта из ленты, но пропадёт из избранного у тех, кто успел её сохранить."}
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
