import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { MotivationFeed } from "@/components/motivation/motivation-feed";
import { MotivationNav } from "@/components/motivation/motivation-nav";
import { getProfile } from "@/lib/api";
import { getMotivationFeed } from "@/lib/motivation-api";

export default async function MotivationFavoritesPage() {
  const [user, feed] = await Promise.all([getProfile(), getMotivationFeed("favorites")]);
  if (!user) redirect("/login");
  return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950"><Header user={user} /><main className="mx-auto max-w-3xl px-4 py-8"><h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Избранное</h1><MotivationNav active="favorites" /><MotivationFeed initial={feed ?? { items: [], nextCursor: null }} favorites /></main></div>;
}
