"use client";

import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
        online
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`}
      />
      {online ? "В сети" : "Офлайн"}
    </span>
  );
}
