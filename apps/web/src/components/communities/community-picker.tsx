"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, Search } from "lucide-react";
import type {
  CommunityBadgeDto,
  CommunityDto,
  MyCommunitiesResponse,
} from "@vedamatch/shared";
import {
  CommunitiesApiError,
  getMyCommunities,
  joinCommunity,
  leaveCommunity,
  searchCommunities,
  updateMyMembership,
} from "@/lib/communities-api";
import { COMMUNITY_KIND_LABELS, JOIN_POLICY_LABELS } from "./community-labels";

/**
 * Выбор общины в профиле: поиск, заявка на вступление, значок.
 *
 * Портальный компонент — принадлежность к общине нужна всем сервисам сразу,
 * поэтому он лежит рядом с общими, а не внутри сервиса.
 */
export function CommunityPicker() {
  const [memberships, setMemberships] = useState<CommunityBadgeDto[]>([]);
  const [pending, setPending] = useState<CommunityBadgeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommunityDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((state: MyCommunitiesResponse) => {
    setMemberships(state.memberships);
    setPending(state.pending);
  }, []);

  useEffect(() => {
    let alive = true;
    getMyCommunities()
      .then((state) => {
        if (alive) apply(state);
      })
      .catch((e: unknown) => {
        if (alive)
          setError(
            e instanceof CommunitiesApiError
              ? e.message
              : "Не удалось загрузить общины",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [apply]);

  useEffect(() => {
    const term = query.trim();
    const controller = new AbortController();
    // Сброс результатов живёт внутри таймера, а не в теле эффекта: setState
    // синхронно в эффекте вызывает каскад перерисовок.
    const timeout = window.setTimeout(() => {
      if (term.length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      searchCommunities({ q: term, pageSize: 8 }, controller.signal)
        .then((found) => setResults(found.items))
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setResults([]);
        })
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      apply(await getMyCommunities());
      setQuery("");
      setResults([]);
    } catch (e) {
      setError(e instanceof CommunitiesApiError ? e.message : "Не получилось");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Община
      </h2>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Ятра, храм, нама-хатта или клуб, к которым вы относитесь. Основная
        община показывается значком в вашем профиле.
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Загружаем…</p>
      ) : (
        <>
          {memberships.length > 0 && (
            <ul className="mb-4 space-y-2">
              {memberships.map((community) => (
                <li
                  key={community.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700"
                >
                  {community.isVerified && (
                    <BadgeCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <Link
                    href={`/communities/${community.slug}`}
                    className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {community.name}
                  </Link>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {COMMUNITY_KIND_LABELS[community.kind]}
                    {community.city ? `, ${community.city}` : ""}
                  </span>
                  <div className="ml-auto flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                      <input
                        type="radio"
                        name="primary-community"
                        checked={community.isPrimary}
                        disabled={busyId === community.id}
                        onChange={() =>
                          act(community.id, () =>
                            updateMyMembership(community.id, {
                              isPrimary: true,
                            }),
                          )
                        }
                      />
                      Основная
                    </label>
                    <button
                      type="button"
                      disabled={busyId === community.id}
                      onClick={() =>
                        act(community.id, () => leaveCommunity(community.id))
                      }
                      className="text-sm text-zinc-500 hover:text-rose-600 disabled:opacity-50 dark:text-zinc-400"
                    >
                      Выйти
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {pending.length > 0 && (
            <ul className="mb-4 space-y-2">
              {pending.map((community) => (
                <li
                  key={community.id}
                  className="rounded-xl border border-dashed border-zinc-300 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                >
                  {community.name} — заявка отправлена, ждёт решения
                  администратора общины
                </li>
              ))}
            </ul>
          )}

          <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Найти общину
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название или город"
              className="w-full rounded-lg border border-zinc-300 py-2 pl-9 pr-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-zinc-400" />
            )}
          </div>

          {results.length > 0 && (
            <ul className="mt-2 space-y-1">
              {results.map((community) => {
                const joined = community.membership?.status === "active";
                const requested = community.membership?.status === "pending";
                return (
                  <li
                    key={community.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {community.name}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {COMMUNITY_KIND_LABELS[community.kind]}
                      {community.city ? `, ${community.city}` : ""} ·{" "}
                      {JOIN_POLICY_LABELS[community.joinPolicy]}
                    </span>
                    <span className="ml-auto">
                      {joined || requested ? (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {joined ? "вы уже здесь" : "заявка отправлена"}
                        </span>
                      ) : community.joinPolicy === "invite_only" ? (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          по приглашению
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === community.id}
                          onClick={() =>
                            act(community.id, () => joinCommunity(community.id))
                          }
                          className="rounded-lg border border-zinc-300 px-3 py-1 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          {community.joinPolicy === "open"
                            ? "Вступить"
                            : "Подать заявку"}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Не нашли свою?{" "}
            <Link
              href="/communities/new"
              className="font-medium text-zinc-700 underline dark:text-zinc-300"
            >
              Заведите карточку
            </Link>{" "}
            — её проверит администрация портала.
          </p>
        </>
      )}
    </section>
  );
}
