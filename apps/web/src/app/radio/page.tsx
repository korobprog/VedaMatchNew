import type { Metadata } from "next";
import { headers } from "next/headers";
import { PublicRadio } from "@/components/music/radio/public-radio";
import { getSharedRadioTrack } from "@/lib/music-radio-server-api";
import { sharedTrackMetadata } from "@/lib/radio-share-meta";
import { getAppManifest } from "@/lib/app-download-api";
import { isComContourHost } from "@/lib/app-download-contour";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

/**
 * Запись, которой поделились (VED-661): `/radio?track=…`. Только свой
 * идентификатор — и в карточку превью, и в плеер уходит один и тот же.
 */
function parseSharedTrackId(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^[\w-]{1,64}$/.test(value) ? value : null;
}

/**
 * Карточка ссылки (VED-718): сюда делятся записью каталога, и в мессенджере
 * должна красоваться её обложка с названием, а не карточка портала. Превью
 * собирается на сервере, без cookie, — публичный метод API. Правила сборки и
 * почему заголовок идёт и в `<title>`, — в `sharedTrackMetadata()`.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ track?: string | string[] }>;
}): Promise<Metadata> {
  const id = parseSharedTrackId((await searchParams).track);
  const shared = id ? await getSharedRadioTrack(id) : null;
  return sharedTrackMetadata(shared?.track ?? null);
}

/**
 * Публичная страница «Радио VM» (VED-645): эфир без входа, аватарки
 * слушателей, реклама сервисов и кнопки установки приложения. Ссылку дают
 * в рекламе и соцсетях — открывается гостю, `publicPages` в `proxy.ts`.
 */
export default async function RadioPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string | string[] }>;
}) {
  // Запись, которой поделились (VED-661): `/radio?track=…`.
  const { track } = await searchParams;
  const sharedTrackId = parseSharedTrackId(track);
  const [appManifest, host] = await Promise.all([
    getAppManifest().catch(() => null),
    headers().then((h) => h.get("host")),
  ]);

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Navbar returnTo="/radio" />
      <main className="relative pt-28">
        <PublicRadio
          manifest={appManifest}
          showTelegram={isComContourHost(host)}
          sharedTrackId={sharedTrackId}
        />
      </main>
      <Footer />
    </div>
  );
}
