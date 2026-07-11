"use client";

import { useRouter } from "next/navigation";
import { deleteVedabaseDb } from "@/lib/vedabase/local-db";
import {
  clearVedabaseOfflineData,
  vedabaseActiveUserKey,
} from "@/lib/vedabase/register-service-worker";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      const activeUserId = localStorage.getItem(vedabaseActiveUserKey);
      await clearVedabaseOfflineData();
      if (activeUserId) await deleteVedabaseDb(activeUserId);
      localStorage.removeItem(vedabaseActiveUserKey);
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      Выйти
    </button>
  );
}
