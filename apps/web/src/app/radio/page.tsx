import type { Metadata } from "next";
import { headers } from "next/headers";
import { PublicRadio } from "@/components/music/radio/public-radio";
import { getAppManifest } from "@/lib/app-download-api";
import { isComContourHost } from "@/lib/app-download-contour";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

/**
 * Публичная страница «Радио VM» (VED-645): эфир без входа, аватарки
 * слушателей, реклама сервисов и кнопки установки приложения. Ссылку дают
 * в рекламе и соцсетях — открывается гостю, `publicPages` в `proxy.ts`.
 */
export const metadata: Metadata = {
  title: "Радио VedaMatch",
  description:
    "Киртаны, бхаджаны и записи с программ круглые сутки — слушайте без регистрации и установите приложение VedaMatch.",
  openGraph: {
    title: "Радио VedaMatch",
    description:
      "Киртаны, бхаджаны и записи с программ круглые сутки — слушайте без регистрации.",
  },
};

export default async function RadioPage() {
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
        />
      </main>
      <Footer />
    </div>
  );
}
