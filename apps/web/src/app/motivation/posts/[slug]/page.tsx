import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicMotivationPost } from "@/lib/motivation-api";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublicMotivationPost(slug);
  if (!post) return { title: "VedaMatch Motivation" };
  return { title: `${post.title} — VedaMatch Motivation`, description: post.text, openGraph: { title: post.title, description: post.text, images: post.imageUrl ? [post.imageUrl] : [] } };
}

export default async function PublicMotivationPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublicMotivationPost(slug);
  if (!post) notFound();
  return <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100"><article className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={post.imageUrl} alt={post.title} className="aspect-[4/3] w-full object-cover" /><div className="p-6 sm:p-10"><p className="text-sm font-semibold uppercase tracking-widest text-amber-400">VedaMatch Motivation</p><h1 className="mt-3 text-3xl font-bold">{post.title}</h1><p className="mt-5 whitespace-pre-line text-lg leading-8 text-zinc-300">{post.text}</p>{post.attributionSpeaker && <p className="mt-6 border-l-2 border-amber-500 pl-4 text-sm text-zinc-400">{post.attributionSpeaker}{post.attributionWork ? ` · ${post.attributionWork}` : ""}</p>}<div className="mt-8 grid gap-3 sm:grid-cols-2"><a href={post.storyImageUrl} download className="rounded-xl border border-amber-600 px-5 py-3 text-center font-medium text-amber-300">Скачать для Stories</a><Link href="/login" className="rounded-xl bg-amber-600 px-5 py-3 text-center font-medium text-white hover:bg-amber-700">Войти или зарегистрироваться в VedaMatch</Link></div></div></article></main>;
}
