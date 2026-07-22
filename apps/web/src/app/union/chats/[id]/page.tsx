import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/header";
import { UnionChatPanel } from "@/components/union/union-chat-panel";
import { UnionNav } from "@/components/union/union-nav";
import { getProfile } from "@/lib/api";
import { getUnionChat, getUnionConnectionCounts } from "@/lib/union-api";
import { hasCompleteUnionLocation } from "@/lib/union-location";

type Params = Promise<{ id: string }>;

export default async function UnionChatPage({ params }: { params: Params }) {
  const user = await getProfile();
  if (!user) redirect("/login");
  if (!hasCompleteUnionLocation(user)) redirect("/union/location");

  const { id } = await params;
  const [chat, counts] = await Promise.all([
    getUnionChat(id),
    getUnionConnectionCounts().catch(() => null),
  ]);
  if (!chat) notFound();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Чат Union
        </h1>
        <UnionNav incomingPending={counts?.incomingPending ?? 0} />
        <UnionChatPanel chat={chat} />
      </main>
    </div>
  );
}
