import { notFound } from "next/navigation";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { MomentComposer } from "@/components/chat/moments/moment-composer";
import { getChatMomentSettings, getChatMoments } from "@/lib/chat-api";

export default async function NewMomentPage() {
  const [settings, state] = await Promise.all([
    getChatMomentSettings(),
    getChatMoments(),
  ]);
  if (!settings) notFound();

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-8 pb-28">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text-0">
          Новый момент
        </h1>
        <MomentComposer
          settings={settings}
          remainingToday={state?.remainingToday ?? 0}
        />
      </main>
    </>
  );
}
