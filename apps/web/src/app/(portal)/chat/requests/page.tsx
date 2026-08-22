import Link from "next/link";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatRequestsView } from "@/components/chat/chat-requests-view";
import { getChatRequests } from "@/lib/chat-api";

export default async function ChatRequestsPage() {
  const state = (await getChatRequests()) ?? { requests: [] };

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
              Запросы
            </h1>
            <p className="text-xs text-text-2">
              Первое сообщение от незнакомых людей
            </p>
          </div>
        </header>
        <ChatRequestsView initial={state} />
      </main>
    </>
  );
}
