"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { AdminCommunityListItem } from "@vedamatch/shared";
import {
  CommunitiesApiError,
  decideCommunity,
  getAdminCommunities,
} from "@/lib/communities-api";
import { COMMUNITY_KIND_LABELS } from "./community-labels";

/**
 * Разбор заявок на общины. Премодерация — единственное, что держит справочник
 * ятр от дублей, поэтому очередь должна разбираться в два клика.
 */
export function AdminCommunitiesView() {
  const [items, setItems] = useState<AdminCommunityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getAdminCommunities("pending")
      .then((list) => {
        if (alive) setItems(list.items);
      })
      .catch((e: unknown) => {
        if (alive)
          setError(
            e instanceof CommunitiesApiError
              ? e.message
              : "Не удалось загрузить",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const decide = async (
    id: string,
    decision: "approve" | "reject",
    verify = false,
  ) => {
    setBusyId(id);
    setError(null);
    try {
      await decideCommunity(id, { decision, verify });
      const list = await getAdminCommunities("pending");
      setItems(list.items);
    } catch (e) {
      setError(e instanceof CommunitiesApiError ? e.message : "Не получилось");
    } finally {
      setBusyId(null);
    }
  };

  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-text-1">
        <Loader2 className="size-4 animate-spin" /> Загружаем…
      </p>
    );

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Заявок нет.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((community) => (
            <li
              key={community.id}
              className="glass rounded-2xl border border-glass-brd p-4"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <Link
                  href={`/communities/${community.slug}`}
                  className="font-medium text-text-0 underline"
                >
                  {community.name}
                </Link>
                <span className="text-sm text-text-1">
                  {COMMUNITY_KIND_LABELS[community.kind]}
                  {community.city ? `, ${community.city}` : ""}
                </span>
                {/* Мирское имя заявителя: по духовному не понять, кто это. */}
                <span className="text-sm text-text-2">
                  заявитель: {community.createdByName ?? "—"}
                </span>
              </div>
              {community.descriptionRu && (
                <p className="mt-2 text-sm text-text-1">
                  {community.descriptionRu}
                </p>
              )}
              {community.address && (
                <p className="mt-1 text-sm text-text-2">{community.address}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === community.id}
                  onClick={() => decide(community.id, "approve", true)}
                  className="rounded-lg border border-emerald-400/40 px-3 py-1.5 text-sm text-emerald-400 disabled:opacity-50"
                >
                  Одобрить и подтвердить
                </button>
                <button
                  type="button"
                  disabled={busyId === community.id}
                  onClick={() => decide(community.id, "approve")}
                  className="rounded-lg border border-glass-brd px-3 py-1.5 text-sm text-text-1 disabled:opacity-50"
                >
                  Одобрить без знака
                </button>
                <button
                  type="button"
                  disabled={busyId === community.id}
                  onClick={() => decide(community.id, "reject")}
                  className="rounded-lg border border-red-400/30 px-3 py-1.5 text-sm text-red-400 disabled:opacity-50"
                >
                  Отклонить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
