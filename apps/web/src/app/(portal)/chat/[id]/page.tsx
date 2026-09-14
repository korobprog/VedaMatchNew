import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatRoom } from "@/components/chat/chat-room";
import {
  getChatColorTemplates,
  getChatConversation,
  getChatConversationTheme,
} from "@/lib/chat-api";
import { getAssistantState } from "@/lib/assistant-api";
import { requireUser } from "@/lib/require-user";

/**
 * Клавиатура сжимает страницу, а не наезжает на неё (VED-149).
 *
 * По умолчанию Chrome на Android оставляет высоту страницы прежней и только
 * сдвигает видимую область. Комната беседы считает свою высоту от окна
 * (`100dvh`), поэтому поле ввода оказывалось под клавиатурой, а после её
 * закрытия под полем оставалась пустая полоса фона — у Станислава она
 * бывала выше самого поля, и писать было некуда. С `resizes-content` окно
 * становится ниже на высоту клавиатуры, комната пересчитывается, и поле
 * ввода стоит прямо над ней. Только здесь, а не на весь портал: остальным
 * страницам — полноэкранной ленте Вдохновения прежде всего — прыгающая высота
 * ни к чему. Остальное (`viewportFit`, цвет темы) Next берёт из корневого
 * layout.
 */
export const viewport: Viewport = {
  interactiveWidget: "resizes-content",
};

export default async function ChatConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, conversation, theme, templatesState, assistant] =
    await Promise.all([
      requireUser(),
      getChatConversation(id),
      getChatConversationTheme(id),
      getChatColorTemplates(),
      // Помощник переписки — необязательная кнопка: молчание ассистента
      // прячет её, а не роняет беседу.
      getAssistantState().catch(() => null),
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
          assistantEnabled={assistant?.chatHelperEnabled ?? false}
        />
      </main>
    </>
  );
}
