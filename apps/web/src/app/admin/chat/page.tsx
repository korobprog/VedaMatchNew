import { redirect } from "next/navigation";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { redirectToLogin } from "@/lib/require-user";
import { AdminChatView } from "@/components/chat/admin-chat-view";
import {
  getAdminChatConversations,
  getAdminChatReports,
  getAdminChatStats,
} from "@/lib/chat-api";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Общение — жалобы",
  robots: { index: false, follow: false },
};

export default async function AdminChatPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/chat");
  if (!canOpenAdminSection(user, "chat")) redirect("/");

  const [reports, stats, conversations] = await Promise.all([
    getAdminChatReports().catch(() => null),
    getAdminChatStats().catch(() => null),
    getAdminChatConversations().catch(() => null),
  ]);

  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Общение
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Жалобы на переписку. «Скрыть сообщение» прячет только его — беседа
        остаётся у обоих участников.
      </p>
      <AdminChatView
        initial={reports ?? { reports: [], openCount: 0 }}
        stats={stats}
        initialConversations={conversations ?? { conversations: [] }}
      />
    </>
  );
}
