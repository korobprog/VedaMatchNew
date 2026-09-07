"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Users } from "lucide-react";
import {
  WORK_COLORS,
  type WorkColor,
  type WorkSpaceSummaryDto,
} from "@vedamatch/shared";
import {
  createWorkSpace,
  ensurePersonalWorkSpace,
  listWorkSpaces,
} from "@/lib/work-api";

/** Токен акцента → класс рамки. Хардкод цвета не пережил бы смену темы. */
const EDGE: Record<WorkColor, string> = {
  magenta: "border-magenta/40",
  cyan: "border-cyan/40",
  gold: "border-gold/40",
  violet: "border-violet/40",
  blue: "border-blue/40",
};

const DOT: Record<WorkColor, string> = {
  magenta: "bg-magenta",
  cyan: "bg-cyan",
  gold: "bg-gold",
  violet: "bg-violet",
  blue: "bg-blue",
};

export function WorkSpacesView() {
  const [spaces, setSpaces] = useState<WorkSpaceSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<WorkColor>("cyan");
  const [formOpen, setFormOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      setSpaces(await listWorkSpaces());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить");
    }
  }, []);

  useEffect(() => {
    // Первый заход заводит личную среду «Мои дела»: пустой экран с кнопкой
    // «создайте среду» — самая частая причина закрыть трекер, не начав.
    ensurePersonalWorkSpace()
      .catch(() => undefined)
      .finally(() => {
        void reload();
      });
  }, [reload]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await createWorkSpace({ name: name.trim(), color });
      setName("");
      setFormOpen(false);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    } finally {
      setCreating(false);
    }
  }

  if (!spaces) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-2">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Загружаем рабочие среды…
      </p>
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-magenta">
          {error}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {spaces.map((space) => (
          <li key={space.id}>
            <Link
              href={`/work/planner/${space.id}`}
              className={`flex h-full flex-col gap-2 rounded-2xl glass border ${EDGE[space.color]} px-4 py-4 transition-transform duration-200 hover:-translate-y-0.5`}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`size-2.5 shrink-0 rounded-full ${DOT[space.color]}`}
                />
                <span className="truncate font-semibold text-text-0">
                  {space.name}
                </span>
              </span>
              {space.description && (
                <span className="line-clamp-2 text-sm text-text-1">
                  {space.description}
                </span>
              )}
              <span className="mt-auto flex items-center gap-3 text-xs text-text-2">
                <span className="flex items-center gap-1">
                  <Users aria-hidden className="size-3.5" />
                  {space.memberCount}
                </span>
                <span>
                  {space.openTaskCount > 0
                    ? `${space.openTaskCount} в работе`
                    : "всё закрыто"}
                </span>
                <span className="ml-auto font-mono uppercase">
                  {space.prefix}
                </span>
              </span>
            </Link>
          </li>
        ))}

        <li>
          {formOpen ? (
            <form
              onSubmit={submit}
              className="flex h-full flex-col gap-3 rounded-2xl glass px-4 py-4"
            >
              <label
                className="text-sm font-medium text-text-0"
                htmlFor="work-space-name"
              >
                Название среды
              </label>
              <input
                id="work-space-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                autoFocus
                placeholder="Veda Match"
                className="rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
              />
              <fieldset className="flex items-center gap-2">
                <legend className="sr-only">Цвет обложки</legend>
                {WORK_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={`Цвет ${option}`}
                    aria-pressed={color === option}
                    onClick={() => setColor(option)}
                    className={`size-6 rounded-full ${DOT[option]} ${
                      color === option ? "ring-2 ring-text-0 ring-offset-2" : ""
                    }`}
                  />
                ))}
              </fieldset>
              <div className="mt-auto flex gap-2">
                <button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="rounded-xl bg-magenta px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {creating ? "Создаём…" : "Создать"}
                </button>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-xl px-3 py-2 text-sm text-text-1"
                >
                  Отмена
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="flex h-full min-h-[124px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-glass-brd px-4 py-4 text-sm text-text-1 transition-colors hover:text-text-0"
            >
              <Plus aria-hidden className="size-5" />
              Новая рабочая среда
            </button>
          )}
        </li>
      </ul>
    </div>
  );
}
