"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { WorkAgendaDto, WorkAgendaItemDto } from "@vedamatch/shared";
import { getWorkAgenda } from "@/lib/work-api";

/**
 * «Мой день» — задачи со сроком по всем средам сразу. Ради этого экрана и
 * заводился планировщик у тех, кто ведёт больше одного дела: доска отвечает
 * на вопрос «что с проектом», а этот список — «что мне делать сегодня».
 */
const GROUPS: Array<{ key: keyof WorkAgendaDto; title: string; note: string }> =
  [
    { key: "overdue", title: "Просрочено", note: "Срок прошёл" },
    { key: "today", title: "Сегодня", note: "До конца дня" },
    { key: "soon", title: "Скоро", note: "Срок впереди" },
    { key: "undated", title: "Без срока", note: "Назначено на вас" },
  ];

export function WorkAgendaView() {
  const [agenda, setAgenda] = useState<WorkAgendaDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWorkAgenda()
      .then(setAgenda)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "Не удалось загрузить",
        ),
      );
  }, []);

  if (error) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (!agenda) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-2">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Собираем задачи…
      </p>
    );
  }

  const empty = GROUPS.every((group) => agenda[group.key].length === 0);
  if (empty) {
    return (
      <p className="text-sm text-text-1">
        На вас пока ничего не назначено. Задачи попадают сюда, когда в карточке
        выбран исполнитель.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {GROUPS.map((group) =>
        agenda[group.key].length === 0 ? null : (
          <section key={group.key}>
            <h2 className="mb-2 text-sm font-semibold text-text-0">
              {group.title}
              <span className="ml-2 font-normal text-text-2">{group.note}</span>
            </h2>
            <ul className="space-y-2">
              {agenda[group.key].map((item) => (
                <AgendaRow key={item.taskId} item={item} />
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

function AgendaRow({ item }: { item: WorkAgendaItemDto }) {
  return (
    <li>
      <Link
        href={`/work/planner/${item.spaceId}`}
        className="flex flex-wrap items-center gap-2 rounded-xl glass px-3 py-2"
      >
        <span className="font-mono text-xs text-text-2">{item.key}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-0">
          {item.title}
        </span>
        <span className="text-xs text-text-2">{item.spaceName}</span>
        {item.dueAt && (
          <span className="text-xs text-text-1">
            {new Date(item.dueAt).toLocaleString("ru-RU", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </Link>
    </li>
  );
}
