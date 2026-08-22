import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatMembersView } from "@/components/chat/chat-members-view";
import { getChatConversation, getChatPeople } from "@/lib/chat-api";
import { requireUser } from "@/lib/require-user";

export default async function ChatMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, conversation, people] = await Promise.all([
    requireUser(),
    getChatConversation(id),
    getChatPeople(),
  ]);
  if (!conversation) notFound();
  // В личном диалоге участников не набирают: там их всегда двое.
  if (conversation.kind === "direct") redirect(`/chat/${id}`);

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <header className="mb-5 flex items-center gap-2">
          <Link
            href={`/chat/${id}`}
            aria-label="К переписке"
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
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="truncate font-display text-xl font-semibold text-text-0">
              {conversation.title}
            </h1>
            <p className="text-xs text-text-2">
              {conversation.kind === "channel"
                ? "Канал общины"
                : "Групповая беседа"}
            </p>
          </div>
        </header>

        <ChatMembersView
          conversation={conversation}
          candidates={people?.people ?? []}
          viewerId={user.id}
        />
      </main>
    </>
  );
}
