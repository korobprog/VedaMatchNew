import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * «Написать человеку» — точка входа для остальных сервисов.
 *
 * Знакомства, справочник людей и Рынок ссылаются сюда обычной ссылкой и
 * ничего не знают про устройство чата: беседу заводит сам сервис «Общение».
 * До этого
 * маршрута каждый звал чат по своему идентификатору связи, и после переезда
 * переписки такие ссылки вели в никуда для всех новых знакомств.
 */
export default async function ChatWithUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const token = (await cookies()).get("access_token")?.value;
  if (!token) redirect(`/?returnTo=/chat/with/${userId}`);

  const res = await fetch(`${API_URL}/chat/conversations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ kind: "direct", userId }),
    cache: "no-store",
  });

  // Не получилось — не показываем пустой экран: список бесед честнее
  // «страницы с ошибкой», из которой всё равно некуда идти.
  if (!res.ok) redirect("/chat");

  const conversation = (await res.json()) as { id: string };
  redirect(`/chat/${conversation.id}`);
}
