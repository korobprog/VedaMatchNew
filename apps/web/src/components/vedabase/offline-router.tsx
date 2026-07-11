"use client";

import type { VedabaseLibraryManifest } from "@vedamatch/shared";
import { useEffect, useState } from "react";
import { openVedabaseDb } from "@/lib/vedabase/local-db";
import { vedabaseActiveUserKey } from "@/lib/vedabase/register-service-worker";
import { VedabaseProvider } from "./vedabase-provider";
import { LibraryScreen } from "./library-screen";
import { ReaderScreen } from "./reader-screen";

type OfflineRoute =
  | { kind: "library" }
  | { kind: "reader"; bookSlug: string; chapterSlug: string }
  | { kind: "unknown" };

interface OfflineState {
  userId: string;
  library: VedabaseLibraryManifest;
  route: OfflineRoute;
}

export function OfflineRouter() {
  const [state, setState] = useState<OfflineState | "loading" | "login-required">(
    "loading",
  );

  useEffect(() => {
    const userId = localStorage.getItem(vedabaseActiveUserKey)?.trim();
    let cancelled = false;
    const loading = userId
      ? loadOfflineState(userId, window.location.pathname)
      : Promise.resolve("login-required" as const);
    void loading
      .then((loaded) => {
        if (!cancelled) setState(loaded);
      })
      .catch(() => {
        if (!cancelled) setState("login-required");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return <OfflineMessage>Загрузка локальной библиотеки…</OfflineMessage>;
  }
  if (state === "login-required") {
    return (
      <OfflineMessage>
        Для офлайн-чтения сначала войдите в VedaMatch и скачайте книгу.
      </OfflineMessage>
    );
  }
  if (state.route.kind === "reader") {
    return (
      <ReaderScreen
        userId={state.userId}
        bookSlug={state.route.bookSlug}
        chapterSlug={state.route.chapterSlug}
      />
    );
  }
  if (state.route.kind === "library") {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <VedabaseProvider userId={state.userId} library={state.library}>
          <LibraryScreen />
        </VedabaseProvider>
      </main>
    );
  }
  return <OfflineMessage>Этот раздел недоступен без подключения к сети.</OfflineMessage>;
}

async function loadOfflineState(
  userId: string,
  pathname: string,
): Promise<OfflineState> {
  const database = await openVedabaseDb(userId);
  const books = (await database.getAll("library")).map((record) => record.manifest);
  database.close();
  return {
    userId,
    library: {
      formatVersion: 1,
      generatedAt: new Date(0).toISOString(),
      books,
    },
    route: parseOfflineRoute(pathname),
  };
}

function parseOfflineRoute(pathname: string): OfflineRoute {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1 && segments[0] === "vedabase") {
    return { kind: "library" };
  }
  if (
    segments.length === 4 &&
    segments[0] === "vedabase" &&
    segments[1] === "books"
  ) {
    try {
      return {
        kind: "reader",
        bookSlug: decodeURIComponent(segments[2] ?? ""),
        chapterSlug: decodeURIComponent(segments[3] ?? ""),
      };
    } catch {
      return { kind: "unknown" };
    }
  }
  return { kind: "unknown" };
}

function OfflineMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <section className="max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          Union Vedabase · офлайн
        </p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{children}</p>
      </section>
    </main>
  );
}
