"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSafeReturnTo } from "@/lib/return-to";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

export function SilentRefresh({ returnTo }: { returnTo?: string }) {
  const router = useRouter();

  useEffect(() => {
    fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => {
        if (res.ok) {
          router.replace(getSafeReturnTo(returnTo));
          router.refresh();
        }
      })
      .catch(() => {});
  }, [returnTo, router]);

  return null;
}
