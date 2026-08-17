"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Loader2, MapPin } from "lucide-react";
import type {
  CommunityDto,
  CommunityMemberDto,
} from "@vedamatch/shared";
import {
  CommunitiesApiError,
  getCommunity,
  getCommunityMembers,
  joinCommunity,
  leaveCommunity,
  removeMember,
  respondToMember,
} from "@/lib/communities-api";
import {
  COMMUNITY_KIND_LABELS,
  JOIN_POLICY_LABELS,
  MEMBER_ROLE_LABELS,
} from "./community-labels";

const STATUS_NOTES: Partial<Record<CommunityDto["status"], string>> = {
  pending: "Карточка ждёт проверки администрации портала — её пока никто не видит.",
  paused: "Община на паузе: её нет в справочнике, но ссылка работает.",
  archived: "Община в архиве.",
  removed_by_admin: "Карточка отклонена администрацией.",
};

export function CommunityView({ slug }: { slug: string }) {
  const [community, setCommunity] = useState<CommunityDto | null>(null);
  const [members, setMembers] = useState<CommunityMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const found = await getCommunity(slug);
    // Отдельно от получения самой общины: список участников — это
    // дополнение к карточке, а не условие её существования. Раньше один
    // общий try/catch превращал любой сбой списка (в том числе временный,
    // сетевой) в «Община не найдена» — хотя getCommunity секундой раньше
    // ответил, что она есть.
    const members = await getCommunityMembers(found.id).catch(() => null);
    return { found, members: members?.items ?? [] };
  }, [slug]);

  const apply = useCallback(
    (data: { found: CommunityDto; members: CommunityMemberDto[] }) => {
      setCommunity(data.found);
      setMembers(data.members);
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    load()
      .then((data) => {
        if (alive) apply(data);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof CommunitiesApiError && e.status === 404)
          setNotFound(true);
        else setError(e instanceof CommunitiesApiError ? e.message : "Ошибка");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [load, apply]);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      apply(await load());
    } catch (e) {
      setError(e instanceof CommunitiesApiError ? e.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-text-1">
        <Loader2 className="size-4 animate-spin" /> Загружаем…
      </p>
    );

  if (notFound || !community)
    return (
      <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        Община не найдена.
      </div>
    );

  const membership = community.membership;
  const manages =
    membership?.status === "active" &&
    (membership.role === "owner" || membership.role === "admin");
  const requests = members.filter((member) => member.status === "pending");
  const active = members.filter((member) => member.status === "active");

  return (
    <div className="space-y-6">
      {STATUS_NOTES[community.status] && (
        <p className="rounded-xl border border-glass-brd bg-glass px-4 py-3 text-sm text-text-1">
          {STATUS_NOTES[community.status]}
        </p>
      )}

      <div className="glass rounded-2xl border border-glass-brd p-6">
        <div className="flex flex-wrap items-center gap-2">
          {community.isVerified && (
            <BadgeCheck
              aria-label="Община подтверждена"
              className="size-5 text-emerald-400"
            />
          )}
          <h1 className="font-display text-2xl font-bold text-text-0">
            {community.name}
          </h1>
        </div>
        <p className="mt-1 text-sm text-text-1">
          {COMMUNITY_KIND_LABELS[community.kind]}
          {community.city ? `, ${community.city}` : ""} ·{" "}
          {JOIN_POLICY_LABELS[community.joinPolicy]} · участников:{" "}
          {community.membersCount}
        </p>
        {community.address && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-text-1">
            <MapPin className="size-4 shrink-0" />
            {community.address}
          </p>
        )}
        {community.descriptionRu && (
          <p className="mt-4 whitespace-pre-line text-sm text-text-1">
            {community.descriptionRu}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6">
          {membership?.status === "active" ? (
            <button
              type="button"
              disabled={busy || membership.role === "owner"}
              onClick={() => act(() => leaveCommunity(community.id))}
              title={
                membership.role === "owner"
                  ? "Сначала передайте владение"
                  : undefined
              }
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 transition hover:text-text-0 disabled:opacity-50"
            >
              Выйти из общины
            </button>
          ) : membership?.status === "pending" ? (
            <p className="text-sm text-text-2">
              Заявка отправлена, ждёт решения администратора общины.
            </p>
          ) : community.joinPolicy === "invite_only" ? (
            <p className="text-sm text-text-2">
              В эту общину вступают по приглашению.
            </p>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => joinCommunity(community.id))}
              className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {community.joinPolicy === "open" ? "Вступить" : "Подать заявку"}
            </button>
          )}
        </div>
      </div>

      {manages && requests.length > 0 && (
        <div className="glass rounded-2xl border border-glass-brd p-6">
          <h2 className="mb-4 font-display text-lg font-semibold text-text-0">
            Заявки ({requests.length})
          </h2>
          <ul className="space-y-2">
            {requests.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-glass-brd p-3"
              >
                <span className="font-medium text-text-0">{member.name}</span>
                {member.city && (
                  <span className="text-sm text-text-2">{member.city}</span>
                )}
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        respondToMember(community.id, member.userId, true),
                      )
                    }
                    className="rounded-lg border border-emerald-400/40 px-3 py-1 text-sm text-emerald-400 disabled:opacity-50"
                  >
                    Принять
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        respondToMember(community.id, member.userId, false),
                      )
                    }
                    className="rounded-lg border border-glass-brd px-3 py-1 text-sm text-text-1 disabled:opacity-50"
                  >
                    Отклонить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="glass rounded-2xl border border-glass-brd p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-text-0">
          Участники ({active.length})
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-text-2">Пока никого.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-glass-brd p-3"
              >
                <span className="font-medium text-text-0">{member.name}</span>
                {member.title && (
                  <span className="text-sm text-text-1">{member.title}</span>
                )}
                <span className="text-sm text-text-2">
                  {MEMBER_ROLE_LABELS[member.role]}
                </span>
                {manages && member.role !== "owner" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(() => removeMember(community.id, member.userId))
                    }
                    className="ml-auto text-sm text-text-2 hover:text-red-400 disabled:opacity-50"
                  >
                    Исключить
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
