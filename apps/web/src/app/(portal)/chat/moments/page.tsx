import Link from "next/link";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { MomentsRail } from "@/components/chat/moments/moments-rail";
import { MomentsSettings } from "@/components/chat/moments/moments-settings";
import { getChatMomentSettings, getChatMoments } from "@/lib/chat-api";

export default async function MomentsPage() {
  const [state, settings] = await Promise.all([
    getChatMoments(),
    getChatMomentSettings(),
  ]);

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 pb-28">
        <header className="flex items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-text-0">
              Моменты
            </h1>
            <p className="text-sm text-text-1">
              Фотография или пара слов на сутки. Потом исчезают.
            </p>
          </div>
          <Link
            href="/chat/moments/new"
            className="flex h-11 shrink-0 items-center rounded-2xl border border-mint-edge bg-mint px-4 text-sm font-semibold text-on-mint"
          >
            Опубликовать
          </Link>
        </header>

        {state && state.rings.length > 0 ? (
          <MomentsRail initial={state} />
        ) : (
          <p className="rounded-3xl border border-glass-brd bg-glass p-10 text-center text-sm text-text-1">
            Моментов пока нет — ни у вас, ни у собеседников.
          </p>
        )}

        {settings && <MomentsSettings initial={settings} />}
      </main>
    </>
  );
}
