"use client";

import { useState } from "react";
import type {
  MotivationAuthorWatchDto,
  MotivationSourceWatchDto,
} from "@vedamatch/shared";
import { useAdminCommand } from "./use-admin-command";
import {
  cardClass,
  dangerButton,
  fieldClass,
  primaryButton,
  secondaryButton,
} from "./ui";

function formatDate(value: string | null): string {
  if (!value) return "ещё не запускался";
  return new Date(value).toLocaleString("ru-RU");
}

/**
 * Строка списка. На телефоне подпись идёт над кнопками, а кнопки делят ширину
 * поровну — прежний `flex-wrap` ломал ряд на непредсказуемые куски.
 */
function WatchRow({
  title,
  subtitle,
  meta,
  pendingAction,
  onSearch,
  onRemove,
}: {
  title: string;
  subtitle?: string;
  meta: string;
  pendingAction: string | undefined;
  onSearch: () => void;
  onRemove: () => void;
}) {
  const disabled = pendingAction !== undefined;
  return (
    <li className="rounded-xl bg-glass p-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-text-0">{title}</p>
        {subtitle && <p className="truncate text-xs text-text-2">{subtitle}</p>}
        <p className="text-xs text-text-2">{meta}</p>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onSearch}
          className={secondaryButton}
        >
          {pendingAction === "search" ? "Поиск…" : "Искать сейчас"}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className={dangerButton}
        >
          Удалить
        </button>
      </div>
    </li>
  );
}

export function AuthorWatchList({
  authors,
}: {
  authors: MotivationAuthorWatchDto[];
}) {
  const { pending, errors, run } = useAdminCommand();
  const [name, setName] = useState("");

  function addAuthor() {
    const trimmed = name.trim();
    if (!trimmed) return;
    void run("add", "add", {
      path: "/admin/motivation/authors",
      body: { name: trimmed },
    });
    setName("");
  }

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold text-text-0">Авторы для поиска</h2>
      <p className="mt-1 text-sm text-text-2">
        ИИ ищет цитаты автора сначала во внутренней библиотеке VedaMatch, затем — в
        одобренных веб-источниках.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addAuthor();
          }}
          placeholder="Имя автора, например: Шрила Прабхупада"
          aria-label="Имя автора"
          className={fieldClass}
        />
        <button
          type="button"
          disabled={pending.add !== undefined || !name.trim()}
          onClick={addAuthor}
          className={primaryButton}
        >
          {pending.add ? "Добавление…" : "Добавить"}
        </button>
      </div>
      {errors.add && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-500">
          {errors.add}
        </p>
      )}
      <ul className="mt-4 space-y-2">
        {authors.length === 0 && (
          <li className="rounded-xl border border-dashed border-glass-brd p-4 text-center text-sm text-text-2">
            Список авторов пуст.
          </li>
        )}
        {authors.map((author) => (
          <WatchRow
            key={author.id}
            title={author.name}
            meta={`Последний поиск: ${formatDate(author.lastSearchedAt)} · найдено ${author.lastResultCount}`}
            pendingAction={pending[author.id]}
            onSearch={() =>
              run(author.id, "search", {
                path: `/admin/motivation/authors/${author.id}/search`,
              })
            }
            onRemove={() =>
              run(author.id, "remove", {
                path: `/admin/motivation/authors/${author.id}`,
                method: "DELETE",
              })
            }
          />
        ))}
      </ul>
      {authors.map(
        (author) =>
          errors[author.id] && (
            <p
              key={author.id}
              role="alert"
              className="mt-2 text-sm font-medium text-red-500"
            >
              {author.name}: {errors[author.id]}
            </p>
          ),
      )}
    </div>
  );
}

export function SourceWatchList({
  sources,
}: {
  sources: MotivationSourceWatchDto[];
}) {
  const { pending, errors, run } = useAdminCommand();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");

  function addSource() {
    const trimmed = url.trim();
    if (!trimmed) return;
    void run("add", "add", {
      path: "/admin/motivation/sources",
      body: { url: trimmed, label: label.trim() || undefined },
    });
    setUrl("");
    setLabel("");
  }

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold text-text-0">Источники (ссылки)</h2>
      <p className="mt-1 text-sm text-text-2">
        ИИ извлекает только текст, реально присутствующий на странице, ничего не сочиняя.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://..."
          aria-label="Ссылка на источник"
          className={fieldClass}
        />
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Название (необязательно)"
          aria-label="Название источника"
          className={fieldClass}
        />
        <button
          type="button"
          disabled={pending.add !== undefined || !url.trim()}
          onClick={addSource}
          className={primaryButton}
        >
          {pending.add ? "Добавление…" : "Добавить"}
        </button>
      </div>
      {errors.add && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-500">
          {errors.add}
        </p>
      )}
      <ul className="mt-4 space-y-2">
        {sources.length === 0 && (
          <li className="rounded-xl border border-dashed border-glass-brd p-4 text-center text-sm text-text-2">
            Список источников пуст.
          </li>
        )}
        {sources.map((source) => (
          <WatchRow
            key={source.id}
            title={source.label || source.url}
            subtitle={source.label ? source.url : undefined}
            meta={`Последний запуск: ${formatDate(source.lastFetchedAt)} · найдено ${source.lastResultCount}`}
            pendingAction={pending[source.id]}
            onSearch={() =>
              run(source.id, "search", {
                path: `/admin/motivation/sources/${source.id}/search`,
              })
            }
            onRemove={() =>
              run(source.id, "remove", {
                path: `/admin/motivation/sources/${source.id}`,
                method: "DELETE",
              })
            }
          />
        ))}
      </ul>
      {sources.map(
        (source) =>
          errors[source.id] && (
            <p
              key={source.id}
              role="alert"
              className="mt-2 text-sm font-medium text-red-500"
            >
              {source.label || source.url}: {errors[source.id]}
            </p>
          ),
      )}
    </div>
  );
}
