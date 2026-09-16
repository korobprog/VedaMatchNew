import type { Metadata } from "next";
import { AppDownloadSection } from "@/components/landing/AppDownloadSection";
import { getAppManifest } from "@/lib/app-download-api";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { HexScales } from "@/components/landing/HexScales";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

/**
 * Публичная страница загрузки приложения (VED-176): короткая ссылка для тех,
 * кому прислали её отдельно от лендинга (QR с десктопа, чат, объявление).
 * Открывается без входа — добавлена в `publicPrefixes` (`proxy.ts`).
 */
export const metadata: Metadata = {
  title: "Приложение VedaMatch",
  description:
    "Установите VedaMatch на телефон: Android — файлом прямо с сайта, iPhone и iPad — через Safari.",
};

export default async function AppDownloadPage() {
  const appManifest = await getAppManifest().catch(() => null);

  return (
    <div className="hex-cursor relative min-h-dvh bg-bg-0">
      <HexScales />
      <BackgroundOrbs />
      <NoiseOverlay />
      <Navbar returnTo="/" />
      <main className="pt-24">
        <AppDownloadSection manifest={appManifest} variant="full" />
      </main>
      <Footer />
    </div>
  );
}
