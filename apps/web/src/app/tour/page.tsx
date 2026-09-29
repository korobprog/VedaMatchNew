import type { Metadata } from "next";
import { ProjectTour } from "@/components/tour/project-tour";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { TOUR_CHAPTERS } from "@/lib/tour";

/**
 * «Познакомиться с проектом» (VED-651): публичный туториал с
 * видео-презентациями. Открывается гостю — `publicPages` в `proxy.ts`.
 */
export const metadata: Metadata = {
  title: "Познакомьтесь с VedaMatch",
  description:
    "Короткие видео-презентации: знакомства, астрология, общение, музыка и радио, книги и приложение — что есть на портале VedaMatch и как этим пользоваться.",
  openGraph: {
    title: "Познакомьтесь с VedaMatch",
    description:
      "Видео-туториал по порталу VedaMatch: что есть и как этим пользоваться.",
  },
};

export default function TourPage() {
  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Navbar returnTo="/tour" />
      <main className="relative pt-28">
        <ProjectTour chapters={TOUR_CHAPTERS} />
      </main>
      <Footer />
    </div>
  );
}
