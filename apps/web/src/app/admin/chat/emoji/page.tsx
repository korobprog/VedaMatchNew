import { redirect } from "next/navigation";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { redirectToLogin } from "@/lib/require-user";
import { AdminEmojiView } from "@/components/chat/admin/admin-emoji-view";
import { getAdminChatEmoji } from "@/lib/chat-api";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Общение — смайлики",
  robots: { index: false, follow: false },
};

export default async function AdminChatEmojiPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/chat/emoji");
  if (!canOpenAdminSection(user, "chat")) redirect("/");

  const state = await getAdminChatEmoji().catch(() => null);

  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Общение: смайлики
      </h1>
      <p className="mb-6 text-sm text-text-1">
        «Избранные» в панели смайликов — набор, с которого начинают все
        участники. Каждый потом переделывает его под себя.
      </p>
      <AdminEmojiView initial={state} />
    </>
  );
}
