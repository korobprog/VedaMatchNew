import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { getProfile } from "@/lib/api";
import { getAdminMotivationPosts } from "@/lib/motivation-api";

export default async function AdminMotivationPage() {
  const [user, posts] = await Promise.all([getProfile(), getAdminMotivationPosts()]);
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "service-admin") redirect("/");
  return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950"><Header user={user} /><main className="mx-auto max-w-5xl px-4 py-8"><h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Управление Motivation</h1><div className="mt-6 space-y-3">{(posts ?? []).map((post) => <article key={post.id} className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase text-amber-600">{post.profileType} · {post.audienceTrack}</p><h2 className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">{post.title || post.slug}</h2><p className="mt-1 text-sm text-zinc-500">{post.contentDate} · {post.category}</p></div><a href={`/m/${post.slug}`} className="text-sm text-amber-700 dark:text-amber-300">Открыть</a></div></article>)}</div></main></div>;
}
