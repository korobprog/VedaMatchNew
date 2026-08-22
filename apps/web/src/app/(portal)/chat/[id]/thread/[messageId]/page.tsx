import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ChatThreadState } from "@vedamatch/shared";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatThreadView } from "@/components/chat/chat-thread-view";
import { requireUser } from "@/lib/require-user";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

async function getThread(messageId: string): Promise<ChatThreadState | null> {
  const token = (await cookies()).get("access_token")?.value;
  if (!token) return null;
  const res = await fetch(
    `${API_URL}/chat/messages/${encodeURIComponent(messageId)}/thread`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) return null;
  return (await res.json()) as ChatThreadState;
}

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string; messageId: string }>;
}) {
  const { id, messageId } = await params;
  const [user, thread] = await Promise.all([
    requireUser(),
    getThread(messageId),
  ]);
  if (!thread) notFound();

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <header className="mb-5 flex items-center gap-2">
          <Link
            href={`/chat/${id}`}
            aria-label="К каналу"
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
              Обсуждение
            </h1>
            <p className="text-xs text-text-2">Комментарии к посту канала</p>
          </div>
        </header>

        <ChatThreadView
          initial={thread}
          conversationId={id}
          viewerId={user.id}
        />
      </main>
    </>
  );
}
