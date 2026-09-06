"use client";

import { useEffect, useState } from "react";
import type { CommunityBadgeDto, LibraryLocale } from "@vedamatch/shared";
import { getMyCommunities } from "@/lib/communities-api";
import { t } from "./i18n";

/**
 * От чьего имени выкладывается материал: лично или от общины.
 *
 * Показывается, только когда выбирать есть из чего. Ни у кого, кроме
 * владельцев и администраторов общин, вариантов нет, и пустой список с
 * единственным «От себя» был бы полем, которое ничего не спрашивает.
 *
 * Список берётся из портального справочника, а не из своей копии: право
 * писать от имени общины живёт в членстве, и вторая копия правил разошлась
 * бы с ним на первой же смене роли. Сервер всё равно перепроверяет — здесь
 * список нужен, чтобы не предлагать заведомо невозможное.
 */
export function LibraryCommunitySelect({
  locale,
  value,
  onChange,
  disabled = false,
}: {
  locale: LibraryLocale;
  /** Идентификатор общины; пустая строка — от себя лично. */
  value: string;
  onChange: (communityId: string) => void;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<CommunityBadgeDto[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    getMyCommunities(controller.signal)
      .then((state) => {
        setOptions(
          // Ровно те роли, которым canPostAs скажет «да»: предлагать
          // остальные значит обещать отказ сервера.
          state.memberships.filter(
            (item) => item.role === "owner" || item.role === "admin",
          ),
        );
      })
      .catch(() => {
        // Справочник недоступен — материал всё равно можно выложить от себя.
      });
    return () => controller.abort();
  }, []);

  if (options.length === 0) return null;

  return (
    <label className="block text-sm text-text-1">
      {t(locale, "add.community")}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
      >
        <option value="">{t(locale, "add.communitySelf")}</option>
        {options.map((community) => (
          <option key={community.id} value={community.id}>
            {community.name}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-text-2">
        {t(locale, "add.communityHint")}
      </span>
    </label>
  );
}
