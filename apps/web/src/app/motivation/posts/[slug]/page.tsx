import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicMotivationPost } from "@/lib/motivation-api";

/** Цитата и пояснение склеены пустой строкой — см. motivation-copy.service. */
const SEPARATOR = "\n\n";

/**
 * Карточка ссылки в мессенджерах. У рилса с роликом отдаём и видео: без
 * `og:video` Telegram и WhatsApp показывают только неподвижный кадр, а ссылка
 * на рилс должна разворачиваться в рилс.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublicMotivationPost(slug);
  if (!post) return { title: "VedaMatch Motivation" };
  // Описание — цитата без пояснения: пояснение в карточку всё равно не влезет.
  const description = post.text.split(SEPARATOR)[0].slice(0, 300);
  const poster = post.storyImageUrl || post.imageUrl;
  return {
    title: `${post.title} — Motivation`,
    description,
    openGraph: {
      type: post.videoUrl ? "video.other" : "article",
      title: post.title,
      description,
      images: poster ? [{ url: poster, width: 1080, height: 1920 }] : [],
      ...(post.videoUrl
        ? { videos: [{ url: post.videoUrl, type: "video/mp4", width: 1080, height: 1920 }] }
        : {}),
    },
    twitter: {
      card: post.videoUrl ? "player" : "summary_large_image",
      title: post.title,
      description,
      images: poster ? [poster] : [],
    },
  };
}

export default async function PublicMotivationPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublicMotivationPost(slug);
  if (!post) notFound();
  return <main className="min-h-dvh bg-bg-0 px-4 py-10 text-text-0"><article className="glass mx-auto max-w-2xl overflow-hidden rounded-3xl shadow-2xl">{post.videoUrl ? (
    // Постер обязателен: без него на время загрузки зритель видит пустой
    // прямоугольник вместо кадра. muted — иначе браузер не даст автозапуск.
    <video src={post.videoUrl} poster={post.storyImageUrl || post.imageUrl} autoPlay muted loop playsInline className="aspect-[9/16] w-full bg-bg-1 object-cover" />
  ) : (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={post.imageUrl} alt={post.title} className="aspect-[4/3] w-full object-cover" />
  )}<div className="p-6 sm:p-10"><p className="text-sm font-semibold uppercase tracking-widest text-gold">VedaMatch Motivation</p><h1 className="mt-3 text-3xl font-bold">{post.title}</h1><p className="mt-5 whitespace-pre-line text-lg leading-8 text-text-1">{post.text}</p>{post.attributionSpeaker && <p className="mt-6 border-l-2 border-gold pl-4 text-sm text-text-2">{post.attributionSpeaker}{post.attributionWork ? ` · ${post.attributionWork}` : ""}</p>}<div className="mt-8 grid gap-3 sm:grid-cols-2"><a href={post.storyImageUrl} download className="rounded-xl border border-gold px-5 py-3 text-center font-medium text-gold">Скачать для Stories</a><Link href="/login" className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-5 py-3 text-center font-medium text-white">Войти или зарегистрироваться в VedaMatch</Link></div></div></article></main>;
}
