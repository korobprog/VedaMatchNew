"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function getSafeReturnTo(returnTo?: string): string {
  if (!returnTo?.startsWith("/")) return "/";

  const baseUrl = "https://vedamatch.local";
  const destination = new URL(returnTo, baseUrl);
  return destination.origin === baseUrl
    ? `${destination.pathname}${destination.search}${destination.hash}`
    : "/";
}

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
