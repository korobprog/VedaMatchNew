import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { MotivationFeed } from "@/components/motivation/motivation-feed";
import { MotivationNav } from "@/components/motivation/motivation-nav";
import { getProfile } from "@/lib/api";
import { getMotivationFeed } from "@/lib/motivation-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export default async function MotivationPage() {
  const [user, feed] = await Promise.all([getProfile(), getMotivationFeed()]);
  if (!user) redirect("/login");
  if (!user.spiritualStage) redirect("/self-identification");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="font-display text-3xl font-bold text-text-0">VedaMatch Motivation</h1>
        <p className="mt-2 text-text-1">Ежедневная мотивация с учётом вашего духовного профиля.</p>
        <MotivationNav active="feed" />
        <MotivationFeed initial={feed ?? { items: [], nextCursor: null }} />
      </main>
    </div>
  );
}
