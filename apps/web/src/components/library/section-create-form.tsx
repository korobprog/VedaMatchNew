"use client";

import { useState } from "react";
import type { LibrarySectionDto, SaveLibrarySectionRequest } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Создание раздела справочника — только админка. Слаг и порядок (position)
 * считает бэкенд сам, здесь только два обязательных названия и необязательное
 * описание.
 */
export function SectionCreateForm({
  onCreated,
}: {
  onCreated: (section: LibrarySectionDto) => void;
}) {
  const [titleRu, setTitleRu] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!titleRu.trim() || !titleEn.trim()) {
      setError("Нужны оба названия — русское и английское");
      return;
    }
    setPending(true);
    try {
      const body: SaveLibrarySectionRequest = {
        titleRu: titleRu.trim(),
        titleEn: titleEn.trim(),
      };
      const res = await apiFetch(`${API_URL}/library/sections`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("Не получилось создать раздел");
        return;
      }
      const created = (await res.json()) as LibrarySectionDto;
      setTitleRu("");
      setTitleEn("");
      onCreated(created);
    } catch {
      setError("Не получилось создать раздел");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <label className="text-sm text-text-1">
        Название по-русски
        <input
          value={titleRu}
          onChange={(event) => setTitleRu(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
        />
      </label>
      <label className="text-sm text-text-1">
        Название по-английски
        <input
          value={titleEn}
          onChange={(event) => setTitleEn(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-end rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
      >
        Создать раздел
      </button>
      {error && (
        <p className="sm:col-span-3 text-xs text-magenta">{error}</p>
      )}
    </form>
  );
}
