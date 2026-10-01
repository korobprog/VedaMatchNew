import type { Metadata } from "next";
import { headers } from "next/headers";
import { PublicRadio } from "@/components/music/radio/public-radio";
import { getSharedRadioTrack } from "@/lib/music-radio-server-api";
import { getAppManifest } from "@/lib/app-download-api";
import { isComContourHost } from "@/lib/app-download-contour";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

const RADIO_TITLE = "Радио VedaMatch";
const RADIO_DESCRIPTION =
  "Киртаны, бхаджаны и записи с программ круглые сутки — слушайте без регистрации и установите приложение VedaMatch.";
const RADIO_OG_DESCRIPTION =
  "Киртаны, бхаджаны и записи с программ круглые сутки — слушайте без регистрации.";

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
 * собирается на сервере, без cookie, — публичный метод API.
 *
 * `openGraph.images` объявляется всегда: пустой список перекрывает
 * opengraph-image.png из корня, иначе бот получил бы картинку портала.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ track?: string | string[] }>;
}): Promise<Metadata> {
  const id = parseSharedTrackId((await searchParams).track);
  const shared = id ? await getSharedRadioTrack(id) : null;
  const track = shared?.track ?? null;
  const artist = track?.artist?.name ?? null;
  const title = track
    ? `${track.title}${artist ? ` — ${artist}` : ""}`
    : RADIO_TITLE;
  const image = track?.coverUrl ?? null;
  return {
    title: RADIO_TITLE,
    description: RADIO_DESCRIPTION,
    openGraph: {
      type: "website",
      siteName: "VedaMatch",
      title,
      description: RADIO_OG_DESCRIPTION,
      images: image ? [{ url: image, alt: title }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: RADIO_OG_DESCRIPTION,
      images: image ? [image] : [],
    },
  };
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
