import type {
  MusicRadioInsertsDto,
  MusicRadioStateDto,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

/**
 * Клиент «Радио VM» (VED-437): эфир, отметка слушателя и голосовые вставки
 * редакции.
 */
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(
      body?.message ?? `Не удалось выполнить запрос (${res.status})`,
    );
  }
  return (await res.json()) as T;
}

export function fetchMusicRadio(): Promise<MusicRadioStateDto> {
  return call<MusicRadioStateDto>("/music/radio");
}

/** «Слушаю»: раз в 20 секунд, ответ — свежий эфир. */
export function musicRadioHeartbeat(): Promise<MusicRadioStateDto> {
  return call<MusicRadioStateDto>("/music/radio/heartbeat", {
    method: "POST",
  });
}

/** Радио выключили — из счётчика сразу. */
export function leaveMusicRadio(): Promise<unknown> {
  return call("/music/radio/heartbeat", { method: "DELETE", keepalive: true });
}

export function fetchMusicRadioInserts(): Promise<MusicRadioInsertsDto> {
  return call<MusicRadioInsertsDto>("/music/admin/radio/inserts");
}

export function createMusicRadioInsert(input: {
  file: Blob;
  fileName: string;
  title: string;
  /** ISO; `null` — в эфир сразу. */
  scheduledAt: string | null;
  durationSeconds: number | null;
}): Promise<{ id: string; scheduledAt: string }> {
  const form = new FormData();
  form.append("file", input.file, input.fileName);
  form.append("title", input.title);
  if (input.scheduledAt) form.append("scheduledAt", input.scheduledAt);
  if (input.durationSeconds) {
    form.append("durationSeconds", String(input.durationSeconds));
  }
  return call("/music/admin/radio/inserts", { method: "POST", body: form });
}

export function deleteMusicRadioInsert(id: string): Promise<unknown> {
  return call(`/music/admin/radio/inserts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
