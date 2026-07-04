"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** На /login: если жив refresh-токен — тихо обновляем сессию и уходим на главную */
export function SilentRefresh() {
  const router = useRouter();

  useEffect(() => {
    fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => {
        if (res.ok) {
          router.push("/");
          router.refresh();
        }
      })
      .catch(() => {});
  }, [router]);

  return null;
}
