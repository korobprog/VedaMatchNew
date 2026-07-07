import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import { getUnionChat } from "@/lib/union-api";
import { Header } from "@/components/header";
import { UnionChatPanel } from "@/components/union/union-chat-panel";

type Params = Promise<{ id: string }>;

export default async function UnionChatPage({ params }: { params: Params }) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { id } = await params;
  const chat = await getUnionChat(id);
  if (!chat) notFound();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Чат Union
          </h1>
          <Link
            href="/union/recommendations"
            className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            ← К рекомендациям
          </Link>
        </div>
        <UnionChatPanel chat={chat} />
      </main>
    </div>
  );
}
