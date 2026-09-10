import { CallsHistoryView } from "@/components/chat/calls/calls-history-view";
import { requireUser } from "@/lib/require-user";

export const metadata = {
  title: "Звонки — VedaMatch",
  description: "История звонков: кто звонил, кому и когда.",
  robots: { index: false, follow: false },
};

export default async function ChatCallsPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <h1 className="font-display text-2xl font-bold text-text-0">Звонки</h1>
      <p className="mt-1 mb-6 text-sm text-text-1">
        Кто звонил, кому и когда. Позвонить можно из диалога — там же, где
        переписка.
      </p>
      <CallsHistoryView userId={user.id} />
    </main>
  );
}
