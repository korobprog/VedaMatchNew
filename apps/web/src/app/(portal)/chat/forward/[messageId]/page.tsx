import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ChatThreadState } from "@vedamatch/shared";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatForwardView } from "@/components/chat/chat-forward-view";
import { getChatList } from "@/lib/chat-api";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * Само сообщение берём через ветку: она уже отдаёт пост целиком и проверяет,
 * что человек вправе его видеть. Отдельной ручки «дай одно сообщение» ради
 * этого экрана заводить незачем.
 */
async function getMessage(messageId: string): Promise<ChatThreadState | null> {
  const token = (await cookies()).get("access_token")?.value;
  if (!token) return null;
  const res = await fetch(
    `${API_URL}/chat/messages/${encodeURIComponent(messageId)}/thread`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) return null;
  return (await res.json()) as ChatThreadState;
}

export default async function ChatForwardPage({
  params,
}: {
  params: Promise<{ messageId: string }>;
}) {
  const { messageId } = await params;
  const [thread, list] = await Promise.all([
    getMessage(messageId),
    getChatList(),
  ]);
  if (!thread) notFound();

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <header className="mb-5 flex items-center gap-2">
          <Link
            href={`/chat/${thread.post.conversationId}`}
            aria-label="Назад в переписку"
            className="flex size-11 items-center justify-center rounded-2xl text-text-1 hover:text-text-0"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-xl font-semibold text-text-0">
              Переслать
            </h1>
            <p className="text-xs text-text-2">
              Сообщение уйдёт копией с подписью, от кого оно
            </p>
          </div>
        </header>

        <ChatForwardView
          message={thread.post}
          conversations={list?.conversations ?? []}
          fromConversationId={thread.post.conversationId}
        />
      </main>
    </>
  );
}
