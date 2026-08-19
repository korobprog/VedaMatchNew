"use client";

import { useRouter } from "next/navigation";
import type { LibraryLocale } from "@vedamatch/shared";
import { t } from "./i18n";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function LocaleSwitch({ locale }: { locale: LibraryLocale }) {
  const router = useRouter();

  async function change(next: LibraryLocale) {
    if (next === locale) return;
    const response = await apiFetch(`${API_URL}/library/me/preferences`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uiLanguage: next }),
    });
    if (response.ok) router.refresh();
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-text-2">
      <span>{t(locale, "locale.switch")}</span>
      <select
        value={locale}
        onChange={(event) => void change(event.target.value as LibraryLocale)}
        className="rounded-lg border border-glass-brd bg-bg-0 px-2 py-1 text-text-0"
      >
        <option value="ru">RU</option>
        <option value="en">EN</option>
      </select>
    </label>
  );
}
