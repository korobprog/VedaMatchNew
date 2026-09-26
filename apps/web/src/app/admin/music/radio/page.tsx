import type { Metadata } from "next";
import { MusicAdminTabs } from "@/components/music/admin/admin-tabs";
import { MusicRadioInsertsEditor } from "@/components/music/admin/radio-inserts-editor";
import {
  getMusicAdminRadioInserts,
  getMusicAdminSummary,
} from "@/lib/music-admin-api";

export const metadata: Metadata = {
  title: "Радио Медиатеки",
  robots: { index: false, follow: false },
};

/**
 * Эфир «Радио VM» (VED-437): голосовые вставки редакции. Сам эфир
 * собирается без участия редакции — опубликованные записи каталога в
 * случайном порядке без повторов.
 */
export default async function MusicAdminRadioPage() {
  const [summary, inserts] = await Promise.all([
    getMusicAdminSummary(),
    getMusicAdminRadioInserts(),
  ]);

  return (
    <>
      <MusicAdminTabs active="radio" pendingCount={summary?.pending ?? 0} />

      <p className="mb-5 max-w-2xl text-sm text-text-1">
        Радио играет опубликованные записи Медиатеки в случайном порядке и не
        повторяет ни одну, пока не прозвучат все. Аудиокниги и лекции в эфир не
        попадают. Голосовая вставка прерывает эфир — сразу или в назначенную
        минуту, — а после неё радио продолжает музыку.
      </p>

      <MusicRadioInsertsEditor initial={inserts?.inserts ?? []} />
    </>
  );
}
