"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Loader2, X } from "lucide-react";
import type {
  WorkInviteDto,
  WorkMemberRole,
  WorkSpaceDto,
} from "@vedamatch/shared";
import {
  createWorkInvite,
  listWorkInvites,
  revokeWorkInvite,
} from "@/lib/work-api";

const ROLE_TITLE: Record<WorkMemberRole, string> = {
  owner: "владелец",
  admin: "администратор",
  member: "участник",
  viewer: "наблюдатель",
};

/**
 * Приглашение ссылкой. Ссылка показывается ровно один раз — сразу после
 * создания: в базе лежит только её хеш, и второй раз собрать её неоткуда.
 * Поэтому свежая ссылка остаётся на экране, пока панель открыта, и рядом с
 * ней стоит кнопка «скопировать», а не «показать».
 */
export function WorkInvitePanel({
  space,
  onChanged,
}: {
  space: WorkSpaceDto;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [invites, setInvites] = useState<WorkInviteDto[] | null>(null);
  const [fresh, setFresh] = useState<WorkInviteDto | null>(null);
  const [role, setRole] = useState<Exclude<WorkMemberRole, "owner">>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canInvite = space.role === "owner" || space.role === "admin";

  const reload = useCallback(async () => {
    try {
      setInvites(await listWorkInvites(space.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить");
    }
  }, [space.id]);

  useEffect(() => {
    if (!open || !canInvite) return;
    let alive = true;
    listWorkInvites(space.id)
      .then((loaded) => {
        if (alive) setInvites(loaded);
      })
      .catch((cause: unknown) => {
        if (alive) {
          setError(
            cause instanceof Error ? cause.message : "Не удалось загрузить",
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [open, canInvite, space.id]);

  if (!canInvite) return null;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const invite = await createWorkInvite(space.id, { role });
      setFresh(invite);
      setCopied(false);
      await reload();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Буфер обмена закрыт настройками браузера — ссылку видно и так,
      // выделить её руками человек сможет.
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-glass px-3 py-2 text-sm text-text-0"
      >
        <Link2 aria-hidden className="size-4" />
        Пригласить
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Приглашение в рабочую среду"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-sheet p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-display text-lg font-bold text-text-0">
                Пригласить в «{space.name}»
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="ml-auto rounded-lg p-1 text-text-1"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>

            {error && (
              <p role="alert" className="mb-3 text-sm text-magenta">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm text-text-1">
                Роль
                <select
                  value={role}
                  onChange={(event) =>
                    setRole(
                      event.target.value as Exclude<WorkMemberRole, "owner">,
                    )
                  }
                  className="mt-1 block rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
                >
                  <option value="member">Участник — ведёт задачи</option>
                  <option value="viewer">Наблюдатель — только смотрит</option>
                  <option value="admin">Администратор — заводит доски</option>
                </select>
              </label>
              <button
                type="button"
                onClick={create}
                disabled={busy}
                className="rounded-xl bg-magenta px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Готовим…" : "Создать ссылку"}
              </button>
            </div>

            {fresh?.url && (
              <div className="mt-3 rounded-xl border border-glass-brd bg-bg-1 p-3">
                <p className="text-xs text-text-2">
                  Ссылка показывается один раз — скопируйте её сейчас. Действует
                  до{" "}
                  {new Date(fresh.expiresAt).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                  })}
                  .
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    readOnly
                    value={fresh.url}
                    aria-label="Ссылка приглашения"
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-lg bg-glass px-2 py-1.5 font-mono text-xs text-text-0"
                  />
                  <button
                    type="button"
                    onClick={() => fresh.url && copy(fresh.url)}
                    className="flex items-center gap-1 rounded-lg bg-glass px-2 py-1.5 text-xs text-text-0"
                  >
                    <Copy aria-hidden className="size-3.5" />
                    {copied ? "Скопировано" : "Копировать"}
                  </button>
                </div>
              </div>
            )}

            <h3 className="mt-5 text-sm font-semibold text-text-0">
              Участники
            </h3>
            <ul className="mt-2 space-y-1 text-sm">
              {space.members.map((member) => (
                <li key={member.userId} className="flex items-center gap-2">
                  <span className="truncate text-text-0">{member.name}</span>
                  <span className="text-xs text-text-2">
                    {ROLE_TITLE[member.role]}
                  </span>
                </li>
              ))}
            </ul>

            <h3 className="mt-5 text-sm font-semibold text-text-0">
              Действующие ссылки
            </h3>
            {invites === null ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-text-2">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Загружаем…
              </p>
            ) : invites.length === 0 ? (
              <p className="mt-2 text-sm text-text-2">Пока ни одной.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {invites.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex items-center gap-2 text-sm text-text-1"
                  >
                    <span>{ROLE_TITLE[invite.role]}</span>
                    <span className="text-xs text-text-2">
                      вошли: {invite.useCount}
                      {invite.maxUses > 0 ? ` из ${invite.maxUses}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await revokeWorkInvite(invite.id);
                        await reload();
                      }}
                      className="ml-auto text-xs text-magenta"
                    >
                      Отозвать
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
