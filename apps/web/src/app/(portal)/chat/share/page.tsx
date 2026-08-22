import Link from "next/link";
import { redirect } from "next/navigation";
import type { ChatAttachmentInput, ChatAttachmentKind } from "@vedamatch/shared";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatShareView } from "@/components/chat/chat-share-view";
import { shareSourceLabel } from "@/components/chat/chat-share-label";
import { getChatList } from "@/lib/chat-api";

/** Виды карточек, которые умеют присылать другие сервисы портала. */
const SHARABLE: ChatAttachmentKind[] = ["story", "notice", "listing", "contact"];

type Query = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

export default async function ChatSharePage({
  searchParams,
}: {
  searchParams: Query;
}) {
  const query = await searchParams;
  const kind = one(query.kind) as ChatAttachmentKind | undefined;
  const title = one(query.title);

  // Без вида и заголовка делиться нечем: показываем список бесед, а не
  // пустую карточку, из которой всё равно некуда идти.
  if (!kind || !SHARABLE.includes(kind) || !title) redirect("/chat");

  const attachment: ChatAttachmentInput = {
    kind,
    title,
    subtitle: one(query.subtitle),
    body: one(query.body),
    previewUrl: one(query.previewUrl),
    sourceService: one(query.sourceService),
    sourceId: one(query.sourceId),
  };

  const state = (await getChatList()) ?? { conversations: [], requestsCount: 0 };

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
              Отправить в чат
            </h1>
            <p className="text-xs text-text-2">
              Карточка уйдёт снимком — она останется в переписке, даже если
              оригинал изменят
            </p>
          </div>
        </header>

        <ChatShareView
          conversations={state.conversations}
          attachment={attachment}
          sourceLabel={shareSourceLabel(kind)}
        />
      </main>
    </>
  );
}
