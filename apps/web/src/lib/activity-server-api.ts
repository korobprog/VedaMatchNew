// Серверный клиент ленты друзей. См. docs/service-module-contract.md
//
// Отдельный файл по той же причине, что notices-server-api.ts и
// communities-server-api.ts: `next/headers` нельзя импортировать в модуль,
// который тянут клиентские компоненты, а виджет ленты сам — клиентский
// (живые карточки по SSE).
import { cookies } from "next/headers";
import type { ActivityFeedResponse } from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Первичная лента для серверного рендера страницы; дальше её ведёт SSE. */
export async function getActivityFeedServer(): Promise<ActivityFeedResponse | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}/activity/feed`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`API /activity/feed failed: ${res.status}`);
  return (await res.json()) as ActivityFeedResponse;
}
