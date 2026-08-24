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

  // Без видимой подписи «Язык интерфейса»: на мобильном она вытесняла себя
  // на отдельную строку. Название переключателя остаётся для скринридера.
  return (
    <select
      aria-label={t(locale, "locale.switch")}
      value={locale}
      onChange={(event) => void change(event.target.value as LibraryLocale)}
      className="rounded-xl border border-glass-brd bg-bg-0 px-2 py-2 text-sm text-text-0"
    >
      <option value="ru">RU</option>
      <option value="en">EN</option>
    </select>
  );
}
