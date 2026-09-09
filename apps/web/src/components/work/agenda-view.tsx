"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type {
  WorkAgendaDto,
  WorkAgendaItemDto,
  WorkAgendaResponseDto,
} from "@vedamatch/shared";
import { getWorkAgenda } from "@/lib/work-api";
import { priorityMark } from "./task-priority";

/**
 * «Мой день» — задачи со сроком по всем средам сразу. Ради этого экрана и
 * заводился планировщик у тех, кто ведёт больше одного дела: доска отвечает
 * на вопрос «что с проектом», а этот список — «что мне делать сегодня».
 */
const RESPONSE_STATUS: Record<WorkAgendaResponseDto["status"], string> = {
  new: "ждёт ответа",
  in_dialog: "в диалоге",
  accepted: "принят",
};

const RESPONSE_KIND: Record<WorkAgendaResponseDto["offerKind"], string> = {
  work: "Работа",
  seva: "Служение",
  task: "Задача",
};

type TaskGroupKey = Exclude<keyof WorkAgendaDto, "responses">;

const GROUPS: Array<{ key: TaskGroupKey; title: string; note: string }> =
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

  const empty =
    GROUPS.every((group) => agenda[group.key].length === 0) &&
    agenda.responses.length === 0;
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
      {agenda.responses.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-text-0">
            Отклики
            <span className="ml-2 font-normal text-text-2">
              Ваши отклики в Вакансиях
            </span>
          </h2>
          <ul className="space-y-2">
            {agenda.responses.map((item) => (
              <ResponseRow key={item.responseId} item={item} />
            ))}
          </ul>
        </section>
      )}
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
  // Метка та же, что на доске: важность не должна выглядеть по-разному в
  // двух местах, где на неё смотрят.
  const mark = priorityMark(item.priority);

  return (
    <li>
      <Link
        href={`/work/planner/${item.spaceId}`}
        className={`flex flex-wrap items-center gap-2 rounded-xl glass px-3 py-2 ${
          mark?.edge ?? ""
        }`}
      >
        <span className="font-mono text-xs text-text-2">{item.key}</span>
        {mark && (
          <span className="flex items-center gap-1 rounded-full bg-glass px-1.5 py-0.5 text-[10px] text-text-1">
            <span aria-hidden className={`size-1.5 rounded-full ${mark.dot}`} />
            {mark.label}
          </span>
        )}
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

function ResponseRow({ item }: { item: WorkAgendaResponseDto }) {
  return (
    <li>
      <Link
        href={`/vacancies/${item.offerId}`}
        className="flex flex-wrap items-center gap-2 rounded-xl glass px-3 py-2"
      >
        <span className="text-xs text-text-2">{RESPONSE_KIND[item.offerKind]}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-0">
          {item.offerTitle}
        </span>
        <span className="text-xs text-text-1">{RESPONSE_STATUS[item.status]}</span>
      </Link>
    </li>
  );
}
