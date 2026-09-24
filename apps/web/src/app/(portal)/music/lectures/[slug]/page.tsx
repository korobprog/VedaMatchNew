import type { Metadata } from "next";
import { getMusicAudiobook } from "@/lib/music-api";
import { MusicAudiobookBookPage } from "@/components/music/audiobook-book-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getMusicAudiobook(slug);
  return { title: page ? page.book.title : "Цикл не найден" };
}

/** Страница цикла лекций (VED-437). */
export default async function MusicLecturePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <MusicAudiobookBookPage kind="lecture" slug={slug} />;
}
