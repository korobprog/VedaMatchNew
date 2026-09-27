"use client";

import { useMemo, useState } from "react";
import {
  lineageLabel,
  type LibraryCategoryTreeNode,
  type LineageId,
} from "@vedamatch/shared";
import { LineageSelect } from "@/components/lineage-picker";
import { Alert } from "@/components/ui/alert";
import { fieldClassName } from "@/components/ui/input";
import {
  applyLibraryAuthorLineage,
  setLibraryCategoryLineage,
} from "@/lib/library-admin-api";
import { authorLineageRows } from "../author-lineage";

/**
 * «Линии авторов» (VED-548): у каждой рубрики-автора — ISKCON, матх или
 * паривар. Выбор сохраняется сразу и действует на новые материалы автора и
 * его подрубрик: форма добавления подставит линию сама. Уже выложенным её
 * проставляет отдельная кнопка «Применить ко всем материалам автора» — с
 * подтверждением, потому что она перезаписывает линию, выбранную авторами
 * материалов.
 */
export function LibraryAuthorLineageManager({
  initialTree,
}: {
  initialTree: LibraryCategoryTreeNode[];
}) {
  const [query, setQuery] = useState("");
  // Выбор поверх дерева со страницы: перечитывать дерево ради одной строки
  // незачем.
  const [chosen, setChosen] = useState<Record<string, LineageId | null>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(
    () => authorLineageRows(initialTree, query),
    [initialTree, query],
  );

  async function save(id: string, value: string) {
    const lineage = value ? (value as LineageId) : null;
    setPendingId(id);
    setError(null);
    setNotice(null);
    try {
      const saved = await setLibraryCategoryLineage(id, lineage);
      setChosen((current) => ({ ...current, [id]: saved.lineage }));
    } catch {
      setError("Не удалось сохранить линию автора");
    } finally {
      setPendingId(null);
    }
  }

  async function apply(id: string, title: string, lineage: LineageId) {
    const confirmed = window.confirm(
      `Проставить линию «${lineageLabel(lineage)}» всем материалам «${title}» и его подрубрик? Линия, выбранная авторами материалов, будет заменена.`,
    );
    if (!confirmed) return;
    setPendingId(id);
    setError(null);
    setNotice(null);
    try {
      const result = await applyLibraryAuthorLineage(id);
      setNotice(`«${title}»: линия проставлена материалам — ${result.updated}`);
    } catch {
      setError("Не удалось применить линию к материалам");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mb-8">
      <h2 className="mb-2 font-display text-lg font-semibold text-text-0">
        Линии авторов
      </h2>
      <p className="mb-4 max-w-3xl text-sm text-text-1">
        Линия автора подставляется по умолчанию новым материалам его рубрики и
        подрубрик. Уже выложенные материалы она не меняет — для них кнопка
        «Применить ко всем материалам автора».
      </p>

      <label className="mb-3 block max-w-sm">
        <span className="mb-1 block text-xs text-text-2">Найти автора</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={fieldClassName}
        />
      </label>

      {error && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}
      {notice && (
        <p role="status" className="mb-3 text-sm text-text-0">
          {notice}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-text-2">Ничего не нашлось</p>
      ) : (
        <ul className="glass divide-y divide-glass-brd rounded-2xl border border-glass-brd">
          {rows.map((row) => {
            const lineage = row.id in chosen ? chosen[row.id] : row.lineage;
            const busy = pendingId === row.id;
            return (
              <li
                key={row.id}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
                style={{ paddingLeft: `${0.75 + row.depth * 1.25}rem` }}
              >
                <div className="min-w-0 flex-1">
                  {row.trail && (
                    <p className="truncate text-xs text-text-2">
                      {row.trail} →
                    </p>
                  )}
                  <p
                    id={`author-lineage-${row.id}`}
                    className="truncate text-sm font-semibold text-text-0"
                  >
                    {row.title}
                  </p>
                  <p className="font-mono text-xs text-text-2">
                    Материалов: {row.entries}
                  </p>
                </div>
                <div className="w-full sm:w-64">
                  <LineageSelect
                    value={lineage ?? ""}
                    emptyLabel="Линия не задана"
                    ariaLabel={`Линия автора: ${row.title}`}
                    disabled={busy}
                    onChange={(value) => void save(row.id, value)}
                  />
                </div>
                <button
                  type="button"
                  aria-describedby={`author-lineage-${row.id}`}
                  disabled={busy || !lineage || row.entries === 0}
                  onClick={() =>
                    lineage && void apply(row.id, row.title, lineage)
                  }
                  className="min-h-11 shrink-0 rounded-xl border border-glass-brd px-3 text-sm text-text-1 transition-colors hover:text-text-0 disabled:opacity-50"
                >
                  Применить ко всем материалам автора
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
