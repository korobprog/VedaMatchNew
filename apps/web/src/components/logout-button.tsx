"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteVedabaseDb } from "@/lib/vedabase/local-db";
import {
  clearVedabaseOfflineData,
  vedabaseActiveUserKey,
} from "@/lib/vedabase/register-service-worker";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function LogoutButton({
  children = "Выйти",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Logout failed");

      const activeUserId = localStorage.getItem(vedabaseActiveUserKey);
      const cleanupTasks = [clearVedabaseOfflineData()];
      if (activeUserId) cleanupTasks.push(deleteVedabaseDb(activeUserId));
      await Promise.allSettled(cleanupTasks);
      localStorage.removeItem(vedabaseActiveUserKey);

      router.replace("/");
      router.refresh();
    } catch {
      setError("Не удалось выйти. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        className={cn(
          "rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
          className,
        )}
      >
        {pending ? "Выходим..." : children}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
