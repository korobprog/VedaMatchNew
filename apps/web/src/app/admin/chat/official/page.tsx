import { redirect } from "next/navigation";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { redirectToLogin } from "@/lib/require-user";
import { AdminOfficialChannelView } from "@/components/chat/admin/admin-official-channel-view";
import { getAdminOfficialChannel } from "@/lib/chat-api";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Общение — официальный канал",
  robots: { index: false, follow: false },
};

export default async function AdminChatOfficialPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/chat/official");
  if (!canOpenAdminSection(user, "chat")) redirect("/");

  const stats = await getAdminOfficialChannel().catch(() => null);

  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Общение: официальный канал
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Канал VedaMatch с новостями портала. Публикуют администраторы прямо в
        беседе.
      </p>
      <AdminOfficialChannelView initial={stats} />
    </>
  );
}
