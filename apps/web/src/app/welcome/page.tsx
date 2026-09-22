import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { WelcomeWizard } from "@/components/welcome-wizard";
import { needsWelcome, welcomeHref, welcomeSteps } from "@/lib/welcome";
import { getSafeReturnTo } from "@/lib/return-to";
import { plural } from "@/lib/plural";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export const metadata: Metadata = { title: "Добро пожаловать" };

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo: raw } = await searchParams;
  // Куда человек шёл до того, как портал остановил его мастером. Ссылка на
  // конференцию (VED-360) — главный такой случай: обещание «зарегался и
  // сразу в комнате» держится ровно на том, что путь доживает до конца
  // мастера.
  const returnTo = getSafeReturnTo(
    Array.isArray(raw) ? raw[0] : raw,
  );
  const user = await getProfile();
  if (!user) redirectToLogin(welcomeHref(returnTo));
  // Мастер — экран для новичка и для старого аккаунта, у которого не хватает
  // обязательного. Заполнившему он больше не нужен: имя и город правятся в
  // профиле, анкета переигрывается на своей странице.
  if (!needsWelcome(user)) redirect(returnTo);
  const steps = welcomeSteps(user);

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
          {steps.length}{" "}
          {plural(steps.length, "короткий шаг", "коротких шага", "коротких шагов")}{" "}
          — и портал покажет то, что подходит именно вам.
        </p>
        <WelcomeWizard user={user} returnTo={returnTo} />
      </main>
    </div>
  );
}
