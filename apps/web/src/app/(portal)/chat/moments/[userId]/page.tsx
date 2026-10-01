import { notFound } from "next/navigation";
import { MomentViewer } from "@/components/chat/moments/moment-viewer";
import { getChatMomentsOf } from "@/lib/chat-api";

export default async function MomentFeedPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const feed = await getChatMomentsOf(userId);
  // «Не видно» и «нет ничего» отвечают одинаково: разные ответы позволяли бы
  // перебором выяснить, кому человек открыл доступ.
  if (!feed || feed.moments.length === 0) notFound();

  return <MomentViewer feed={feed} />;
}
