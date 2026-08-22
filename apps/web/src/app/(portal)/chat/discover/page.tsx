import Link from "next/link";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatDiscoverView } from "@/components/chat/chat-discover-view";
import { getChatDiscover } from "@/lib/chat-api";

export default async function ChatDiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ communityId?: string | string[] }>;
}) {
  const { communityId: raw } = await searchParams;
  const communityId = Array.isArray(raw) ? raw[0] : raw;
  const state = (await getChatDiscover(undefined, communityId)) ?? {
    items: [],
  };

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <header className="mb-5 flex items-center gap-2">
          <Link
            href="/chat"
            aria-label="К списку бесед"
            className="flex size-11 items-center justify-center rounded-2xl text-text-1 hover:text-text-0"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-xl font-semibold text-text-0">
              Открытые беседы
            </h1>
            <p className="text-xs text-text-2">
              Чаты и каналы общин, куда можно войти самому
            </p>
          </div>
        </header>

        <ChatDiscoverView initial={state} />
      </main>
    </>
  );
}
