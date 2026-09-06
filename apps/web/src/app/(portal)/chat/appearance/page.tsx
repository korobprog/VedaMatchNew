import Link from "next/link";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatAppearanceView } from "@/components/chat/chat-appearance-view";
import { ChatSendSettingsToggle } from "@/components/chat/chat-send-settings-toggle";
import { getChatColorTemplates } from "@/lib/chat-api";
import { requireUser } from "@/lib/require-user";

export default async function ChatAppearancePage() {
  await requireUser();
  const state = await getChatColorTemplates();

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
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
          <h1 className="font-display text-xl font-semibold text-text-0">
            Мои шаблоны оформления
          </h1>
        </header>
        <ChatAppearanceView initialTemplates={state?.templates ?? []} />
        <ChatSendSettingsToggle />
      </main>
    </>
  );
}
