import Link from "next/link";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatListView } from "@/components/chat/chat-list-view";
import { getChatList } from "@/lib/chat-api";

export default async function ChatPage() {
  const state = (await getChatList()) ?? {
    conversations: [],
    requestsCount: 0,
  };

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <header className="mb-5 flex items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-text-0">
              Общение
            </h1>
            <p className="text-sm text-text-1">
              Личные диалоги, группы и каналы общин.
            </p>
          </div>
          <Link
            href="/chat/people"
            aria-label="Люди портала"
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-glass-brd bg-glass text-text-1 transition-colors hover:text-text-0"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="9" cy="8" r="3.4" />
              <path d="M3.2 19.2c0-3.2 2.6-5.2 5.8-5.2s5.8 2 5.8 5.2" />
              <path d="M16.2 5.2a3.4 3.4 0 010 6.6" />
              <path d="M17.6 14.4c2.1.5 3.6 2.2 3.6 4.8" />
            </svg>
          </Link>
          <Link
            href="/chat/map"
            aria-label="Карта общин"
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-glass-brd bg-glass text-text-1 transition-colors hover:text-text-0"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 4L3.5 6.2v13.3L9 17.3l6 2.2 5.5-2.2V4L15 6.2z" />
              <path d="M9 4v13.3" />
              <path d="M15 6.2V19.5" />
            </svg>
          </Link>
          <Link
            href="/chat/discover"
            aria-label="Открытые беседы"
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-glass-brd bg-glass text-text-1 transition-colors hover:text-text-0"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3.5 12h17" />
              <path d="M12 3.2a15 15 0 010 17.6" />
              <path d="M12 3.2a15 15 0 000 17.6" />
            </svg>
          </Link>
          <Link
            href="/chat/new"
            aria-label="Новая группа"
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-mint-edge bg-mint text-on-mint"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 19.5V17l10-10 2.5 2.5-10 10H4z" />
              <path d="M15 6l3-3 2.5 2.5-3 3z" />
            </svg>
          </Link>
        </header>
        <ChatListView initial={state} />
      </main>
    </>
  );
}
