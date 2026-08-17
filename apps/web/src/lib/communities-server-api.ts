// Серверный клиент портальных общин. См. docs/service-module-contract.md
//
// Отдельный файл по той же причине, что notices-server-api.ts: `next/headers`
// нельзя импортировать в модуль, который тянут клиентские компоненты, а
// голое имя `communities-api.ts` уже занято браузерным клиентом.
import { cookies } from "next/headers";
import type { MyCommunitiesResponse } from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Мои общины: подтверждённое участие и неразобранные заявки. */
export async function getMyCommunitiesServer(): Promise<MyCommunitiesResponse | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}/communities/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 404) return null;
  if (!res.ok) throw new Error(`API /communities/me failed: ${res.status}`);
  return (await res.json()) as MyCommunitiesResponse;
}
