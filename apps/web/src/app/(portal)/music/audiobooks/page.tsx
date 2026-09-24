import type { Metadata } from "next";
import { MusicAudiobookSectionPage } from "@/components/music/audiobook-section-page";

export const metadata: Metadata = {
  title: "Аудиокниги",
  description: "Книги в записи: главы по порядку, продолжение с места",
};

/** Раздел «Аудиокниги» (VED-237 → VED-297). */
export default function MusicAudiobooksPage() {
  return <MusicAudiobookSectionPage kind="audiobook" />;
}
