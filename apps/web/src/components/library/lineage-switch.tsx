"use client";

import { useRouter } from "next/navigation";
import type { LineageId, LineagePreference, LibraryLocale } from "@vedamatch/shared";
import { LineageSelect, inheritLabel } from "@/components/lineage-picker";
import { apiFetch } from "@/lib/http-client";
import { t } from "./i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Какую линию смотреть в Образовании. Настройка сервиса поверх профиля: по
 * умолчанию — как в профиле, но преданный ISKCON вправе читать здесь
 * Гаудия-матх, не меняя, кто он. Сохраняется сразу по выбору, как язык
 * интерфейса рядом.
 */
export function LibraryLineageSwitch({
  locale,
  value,
  profileLineage,
}: {
  locale: LibraryLocale;
  value: LineagePreference;
  profileLineage: LineageId | null;
}) {
  const router = useRouter();

  async function change(next: string) {
    const lineage: LineagePreference = next
      ? (next as Exclude<LineagePreference, null>)
      : null;
    if (lineage === value) return;
    const response = await apiFetch(`${API_URL}/library/me/preferences`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineage }),
    });
    if (response.ok) router.refresh();
  }

  return (
    <LineageSelect
      value={value ?? ""}
      onChange={(next) => void change(next)}
      emptyLabel={inheritLabel(profileLineage)}
      allLabel={t(locale, "lineage.all")}
      className="max-w-full rounded-xl border border-glass-brd bg-bg-0 px-2 py-2 text-sm text-text-0"
    />
  );
}
