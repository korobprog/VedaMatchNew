"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../motivation-admin-api";

export type AdminCommand = {
  path: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

export type RunCommand = (
  key: string,
  action: string,
  command: AdminCommand,
) => Promise<void>;

/**
 * Общее состояние админских действий: какая команда сейчас выполняется и какая
 * ошибка относится к какой строке. Ключ — id поста или строки списка, так что
 * одновременные действия над разными карточками не затирают друг друга.
 */
export function useAdminCommand() {
  const router = useRouter();
  const [pending, setPending] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const run: RunCommand = async (key, action, command) => {
    setPending((current) => ({ ...current, [key]: action }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });

    try {
      await apiRequest(command.path, command.method ?? "POST", command.body);
      router.refresh();
    } catch (requestError) {
      setErrors((current) => ({
        ...current,
        [key]:
          requestError instanceof Error
            ? requestError.message
            : "Не удалось выполнить действие",
      }));
    } finally {
      setPending((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  return { pending, errors, run, refresh: () => router.refresh() };
}
