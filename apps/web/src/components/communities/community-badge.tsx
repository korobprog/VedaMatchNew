import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { CommunityBadgeDto } from "@vedamatch/shared";
import { COMMUNITY_KIND_LABELS } from "./community-labels";

/**
 * Значок принадлежности к общине. Портальный компонент: его можно
 * импортировать из любого сервиса — см. docs/service-module-contract.md.
 *
 * Знак проверки показывается только у верифицированной общины: `active`
 * означает лишь, что это не дубль, и выдавать самоназвание за подтверждённый
 * факт нельзя.
 */
export function CommunityBadge({
  community,
  showRole = false,
}: {
  community: CommunityBadgeDto;
  showRole?: boolean;
}) {
  return (
    <Link
      href={`/communities/${community.slug}`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700 transition hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600"
      title={`${COMMUNITY_KIND_LABELS[community.kind]}${community.city ? `, ${community.city}` : ""}`}
    >
      {community.isVerified && (
        <BadgeCheck
          aria-label="Община подтверждена"
          className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
        />
      )}
      <span className="truncate font-medium">{community.name}</span>
      {community.title && (
        <span className="truncate text-zinc-500 dark:text-zinc-400">
          · {community.title}
        </span>
      )}
      {showRole && community.role !== "member" && (
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
          ({community.role === "owner" ? "владелец" : community.role === "admin" ? "админ" : "модератор"})
        </span>
      )}
    </Link>
  );
}
