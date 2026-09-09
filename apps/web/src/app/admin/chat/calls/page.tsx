import { redirect } from "next/navigation";
import { canOpenAdminSection } from "@/lib/admin-nav";
import { redirectToLogin } from "@/lib/require-user";
import { AdminCallsView } from "@/components/chat/admin/admin-calls-view";
import { getAdminChatCalls } from "@/lib/chat-api";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Общение — звонки",
  robots: { index: false, follow: false },
};

export default async function AdminChatCallsPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/admin/chat/calls");
  if (!canOpenAdminSection(user, "chat")) redirect("/");

  const state = await getAdminChatCalls().catch(() => null);

  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Общение: звонки
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Включение звонков, сводка за период и журнал последних вызовов.
      </p>
      <AdminCallsView initial={state} />
    </>
  );
}
