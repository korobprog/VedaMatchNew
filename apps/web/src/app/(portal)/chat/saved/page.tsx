import { redirect } from "next/navigation";
import { cookies } from "next/headers";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * «Избранное». Не страница, а дверь: беседа заводится при первом обращении,
 * дальше запрос идемпотентно возвращает ту же — как `chat/with/[userId]`.
 */
export default async function SavedPage() {
  const token = (await cookies()).get("access_token")?.value;
  if (!token) redirect("/login");

  const res = await fetch(`${API_URL}/chat/saved`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) redirect("/chat");

  const conversation = (await res.json()) as { id: string };
  redirect(`/chat/${conversation.id}`);
}
