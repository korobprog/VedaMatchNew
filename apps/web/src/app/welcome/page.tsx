import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import {
  WELCOME_STEP_COUNT,
  WelcomeWizard,
} from "@/components/welcome-wizard";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export const metadata: Metadata = { title: "Добро пожаловать" };

export default async function WelcomePage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/welcome");
  // Мастер — экран для новичка. Прошедшему анкету он больше не нужен:
  // имя и город правятся в профиле, анкета переигрывается на своей странице.
  if (user.spiritualStage) redirect("/");

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
          Добро пожаловать в VedaMatch
        </h1>
        <p className="mb-6 text-text-1">
          {WELCOME_STEP_COUNT} коротких шага — и портал покажет то, что
          подходит именно вам.
        </p>
        <WelcomeWizard user={user} />
      </main>
    </div>
  );
}
