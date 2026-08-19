"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteVedabaseDb } from "@/lib/vedabase/local-db";
import { activeUserKey, clearOfflineCaches } from "@/lib/pwa/service-worker";
import { currentSubscription } from "@/lib/pwa/push-subscription";
import { removeSubscription } from "@/lib/notifications-api";
import { Alert } from "@/components/ui/alert";
import { Button, type ButtonVariant } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function LogoutButton({
  children = "Выйти",
  className,
  variant = "secondary",
}: {
  children?: ReactNode;
  className?: string;
  variant?: ButtonVariant;
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

      // На общем устройстве иначе следующий вошедший получал бы чужие пуши.
      const subscription = await currentSubscription().catch(() => null);
      if (subscription) {
        await removeSubscription(subscription.endpoint).catch(() => undefined);
        await subscription.unsubscribe().catch(() => undefined);
      }

      const activeUserId = localStorage.getItem(activeUserKey);
      const cleanupTasks = [clearOfflineCaches()];
      if (activeUserId) cleanupTasks.push(deleteVedabaseDb(activeUserId));
      await Promise.allSettled(cleanupTasks);
      localStorage.removeItem(activeUserKey);

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
      <Button
        variant={variant}
        onClick={logout}
        loading={pending}
        className={className}
      >
        {pending ? "Выходим..." : children}
      </Button>
      {error && (
        <Alert tone="error" className="mt-2">
          {error}
        </Alert>
      )}
    </div>
  );
}
