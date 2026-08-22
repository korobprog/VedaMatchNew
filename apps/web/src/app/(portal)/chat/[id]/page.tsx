import { notFound } from "next/navigation";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatRoom } from "@/components/chat/chat-room";
import { getChatConversation } from "@/lib/chat-api";
import { requireUser } from "@/lib/require-user";

export default async function ChatConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, conversation] = await Promise.all([
    requireUser(),
    getChatConversation(id),
  ]);
  if (!conversation) notFound();

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto max-w-3xl px-4 py-4">
        <ChatRoom initial={conversation} viewerId={user.id} />
      </main>
    </>
  );
}
