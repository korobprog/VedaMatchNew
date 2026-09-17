"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSafeReturnTo } from "@/lib/return-to";
import { refreshSession } from "@/lib/http-client";

export function SilentRefresh({ returnTo }: { returnTo?: string }) {
  const router = useRouter();

  useEffect(() => {
    // Через общий refreshSession: у открытых вкладок одна очередь на refresh.
    refreshSession()
      .then((ok) => {
        if (ok) {
          router.replace(getSafeReturnTo(returnTo));
          router.refresh();
        }
      })
      .catch(() => {});
  }, [returnTo, router]);

  return null;
}
