import type { Metadata } from "next";
import { MusicAudiobookSectionPage } from "@/components/music/audiobook-section-page";

export const metadata: Metadata = {
  title: "Лекции",
  description: "Лекции в записи: циклы по порядку, продолжение с места",
};

/**
 * Раздел «Лекции» (VED-437) — устроен как «Аудиокниги»: цикл с лекциями по
 * порядку, плеер помнит, где человек остановился.
 */
export default function MusicLecturesPage() {
  return <MusicAudiobookSectionPage kind="lecture" />;
}
