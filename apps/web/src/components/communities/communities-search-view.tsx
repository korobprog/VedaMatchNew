"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2 } from "lucide-react";
import type { CommunityDto, CommunityKind } from "@vedamatch/shared";
import { CommunitiesApiError, searchCommunities } from "@/lib/communities-api";
import {
  COMMUNITY_KIND_LABELS,
  COMMUNITY_KIND_ORDER,
  JOIN_POLICY_LABELS,
} from "./community-labels";

/** Справочник общин: поиск, фильтр по типу и городу. */
export function CommunitiesSearchView() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [kinds, setKinds] = useState<CommunityKind[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [items, setItems] = useState<CommunityDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const found = await searchCommunities(
          { q: query, city, kinds, verifiedOnly },
          controller.signal,
        );
        setItems(found.items);
        setTotal(found.total);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(
          e instanceof CommunitiesApiError
            ? e.message
            : "Не удалось загрузить справочник",
        );
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, city, kinds, verifiedOnly]);

  const toggleKind = (kind: CommunityKind) =>
    setKinds((current) =>
      current.includes(kind)
        ? current.filter((item) => item !== kind)
        : [...current, kind],
    );

  return (
    <div>
      <div className="glass mb-6 grid gap-3 rounded-2xl border border-glass-brd p-4 sm:grid-cols-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Название общины"
          className="rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
        <input
          type="search"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Город"
          className="rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {COMMUNITY_KIND_ORDER.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={kinds.includes(kind)}
              onClick={() => toggleKind(kind)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                kinds.includes(kind)
                  ? "border-magenta/40 bg-magenta/10 text-text-0"
                  : "border-glass-brd text-text-1 hover:text-text-0"
              }`}
            >
              {COMMUNITY_KIND_LABELS[kind]}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm text-text-1">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(event) => setVerifiedOnly(event.target.checked)}
            />
            Только подтверждённые
          </label>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-text-1">
          <Loader2 className="size-4 animate-spin" /> Загружаем…
        </p>
      ) : items.length === 0 ? (
        <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          <p>Ничего не нашлось.</p>
          <p className="mt-2">
            Если вашей общины ещё нет в справочнике —{" "}
            <Link href="/communities/new" className="text-text-0 underline">
              заведите карточку
            </Link>
            . Её проверит администрация портала.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-text-2">Найдено: {total}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((community) => (
              <li key={community.id}>
                <Link
                  href={`/communities/${community.slug}`}
                  className="glass block h-full rounded-2xl border border-glass-brd p-4 transition hover:border-magenta/30"
                >
                  <div className="flex items-center gap-2">
                    {community.isVerified && (
                      <BadgeCheck
                        aria-label="Подтверждена"
                        className="size-4 shrink-0 text-emerald-400"
                      />
                    )}
                    <h2 className="truncate font-medium text-text-0">
                      {community.name}
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-text-1">
                    {COMMUNITY_KIND_LABELS[community.kind]}
                    {community.city ? `, ${community.city}` : ""}
                  </p>
                  {community.descriptionRu && (
                    <p className="mt-2 line-clamp-2 text-sm text-text-2">
                      {community.descriptionRu}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-text-2">
                    Участников: {community.membersCount} ·{" "}
                    {JOIN_POLICY_LABELS[community.joinPolicy]}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
