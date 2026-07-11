import type {
  VedabaseBookManifest,
  VedabaseSyncPullResponse,
  VedabaseSyncPushRequest,
  VedabaseSyncPushResponse,
} from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function fetchVedabaseBookManifest(
  bookSlug: string,
  signal?: AbortSignal,
): Promise<VedabaseBookManifest> {
  return fetchJson(`/vedabase/books/${encodeURIComponent(bookSlug)}`, {
    signal,
  });
}

export async function fetchVedabaseChapter(
  bookSlug: string,
  chapterSlug: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch(
    `${API_URL}/vedabase/books/${encodeURIComponent(bookSlug)}/chapters/${encodeURIComponent(chapterSlug)}`,
    { credentials: "include", signal },
  );
  await assertSuccessful(response);
  return response.blob();
}

export async function fetchVedabaseSearchIndex(
  bookSlug: string,
  signal?: AbortSignal,
): Promise<Blob> {
  return fetchBlob(
    `/vedabase/books/${encodeURIComponent(bookSlug)}/search-index`,
    signal,
  );
}

export async function fetchVedabaseCover(
  bookSlug: string,
  signal?: AbortSignal,
): Promise<Blob> {
  return fetchBlob(`/vedabase/books/${encodeURIComponent(bookSlug)}/cover`, signal);
}

export function pushVedabaseMutations(
  request: VedabaseSyncPushRequest,
  signal?: AbortSignal,
): Promise<VedabaseSyncPushResponse> {
  return fetchJson("/vedabase/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
}

export function pullVedabaseChanges(
  after?: string,
  signal?: AbortSignal,
): Promise<VedabaseSyncPullResponse> {
  const query = after ? `?${new URLSearchParams({ after })}` : "";
  return fetchJson(`/vedabase/sync/pull${query}`, { signal });
}

async function fetchJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
  });
  await assertSuccessful(response);
  return (await response.json()) as T;
}

async function fetchBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    signal,
  });
  await assertSuccessful(response);
  return response.blob();
}

async function assertSuccessful(response: Response): Promise<void> {
  if (response.ok) return;

  let message = `Vedabase API request failed: ${response.status}`;
  try {
    const body = (await response.json()) as unknown;
    if (isRecord(body)) {
      if (typeof body.message === "string" && body.message.trim()) {
        message = body.message;
      } else if (Array.isArray(body.message)) {
        const messages = body.message.filter(
          (item): item is string => typeof item === "string",
        );
        if (messages.length > 0) message = messages.join(", ");
      }
    }
  } catch {}
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
