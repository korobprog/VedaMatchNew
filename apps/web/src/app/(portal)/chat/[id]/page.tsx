import { notFound } from "next/navigation";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatRoom } from "@/components/chat/chat-room";
import {
  getChatColorTemplates,
  getChatConversation,
  getChatConversationTheme,
} from "@/lib/chat-api";
import { requireUser } from "@/lib/require-user";

export default async function ChatConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, conversation, theme, templatesState] = await Promise.all([
    requireUser(),
    getChatConversation(id),
    getChatConversationTheme(id),
    getChatColorTemplates(),
  ]);
  if (!conversation) notFound();

  const initialTheme =
    theme?.templateId
      ? (templatesState?.templates.find((t) => t.id === theme.templateId) ??
        null)
      : null;

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto max-w-3xl px-4 py-4">
        <ChatRoom
          initial={conversation}
          viewerId={user.id}
          initialTheme={initialTheme}
        />
      </main>
    </>
  );
}
