import type { VedabaseLibraryManifest } from "@vedamatch/shared";
import { cookies } from "next/headers";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

export async function getVedabaseLibrary(): Promise<VedabaseLibraryManifest | null> {
  const token = (await cookies()).get("access_token")?.value;
  if (!token) return null;

  const response = await fetch(`${API_URL}/vedabase/library`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Vedabase library request failed: ${response.status}`);
  }
  return (await response.json()) as VedabaseLibraryManifest;
}
