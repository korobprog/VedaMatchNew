"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UnionArchiveEntry } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Tab = "archive" | "blocked";

/** Совпадает с UserBlockDto из @vedamatch/shared: аватара там нет. */
interface BlockedPerson {
  userId: string;
  name: string;
  createdAt: string;
}

/**
 * Архив и блокировки — одна сущность «спрятанные мной», разные причины,
 * поэтому один раздел с двумя вкладками, а не два пункта меню. Пять
 * отдельных списков людей в сервисе никто бы не удержал в голове.
 */
export function HiddenPeople({
  archive,
  blocked,
}: {
  archive: UnionArchiveEntry[];
  blocked: BlockedPerson[];
}) {
  const [tab, setTab] = useState<Tab>("archive");

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-2">
        <TabButton active={tab === "archive"} onClick={() => setTab("archive")}>
          Архив · {archive.length}
        </TabButton>
        <TabButton active={tab === "blocked"} onClick={() => setTab("blocked")}>
          Заблокированные · {blocked.length}
        </TabButton>
      </div>

      {tab === "archive" ? (
        archive.length === 0 ? (
          <EmptyNote>
            Архив пуст. Сюда попадают анкеты, убранные кнопкой «В архив» — в
            выдаче они больше не появятся, пока вы их не вернёте.
          </EmptyNote>
        ) : (
          <ul className="space-y-2">
            {archive.map((entry) => (
              <ArchiveRow key={entry.user.id} entry={entry} />
            ))}
          </ul>
        )
      ) : blocked.length === 0 ? (
        <EmptyNote>
          Заблокированных нет. Блокировка действует на всём портале, а не
          только в Знакомствах.
        </EmptyNote>
      ) : (
        <ul className="space-y-2">
          {blocked.map((person) => (
            <li
              key={person.userId}
              className="glass flex items-center gap-3 rounded-2xl border border-glass-brd p-3"
            >
              <Avatar name={person.name} url={null} />
              <span className="min-w-0 flex-1 truncate text-sm text-text-0">
                {person.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ArchiveRow({ entry }: { entry: UnionArchiveEntry }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function restore() {
    if (pending) return;
    setPending(true);
    try {
      const res = await apiFetch(
        `${API_URL}/union/archive/${encodeURIComponent(entry.user.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="glass flex items-center gap-3 rounded-2xl border border-glass-brd p-3">
      <Avatar name={entry.user.name} url={entry.user.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-0">{entry.user.name}</p>
        {entry.user.city && (
          <p className="truncate text-xs text-text-2">{entry.user.city}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void restore()}
        disabled={pending}
        aria-label="Вернуть в выдачу"
        className="rounded-xl border border-glass-brd px-3 py-1.5 text-xs font-medium text-text-1 transition hover:text-text-0 disabled:opacity-50"
      >
        {pending ? "Возвращаем…" : "Вернуть"}
      </button>
    </li>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
        active ? "bg-glass-brd/60 text-text-0" : "text-text-2 hover:text-text-0"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl border border-glass-brd p-8 text-center text-sm text-text-1">
      {children}
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- аватар из внешнего хранилища
      <img
        src={url}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-glass text-sm font-semibold text-text-0">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
