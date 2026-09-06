import { AssistantView } from "@/components/assistant/assistant-view";
import { getAssistantState, getAssistantThread } from "@/lib/assistant-api";

export const metadata = {
  title: "Ассистент портала",
  description:
    "ИИ-помощник VedaMatch: ищет по сервисам портала, помогает с текстами и публикует по просьбе.",
  robots: { index: false, follow: false },
};

function one(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || null;
}

/**
 * `?thread=` открывает беседу, `?q=` задаёт вопрос сразу — так приходит
 * полоса с главной. Оба необязательны.
 */
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string | string[]; q?: string | string[] }>;
}) {
  const params = await searchParams;
  const threadId = one(params.thread);
  const question = one(params.q);
  const [state, thread] = await Promise.all([
    getAssistantState(),
    threadId ? getAssistantThread(threadId).catch(() => null) : null,
  ]);
  if (!state) throw new Error("Не удалось загрузить ассистента");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-28">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Ассистент
        </h1>
        <p className="mt-1 text-sm text-text-1">
          Спрашивайте о товарах, цитатах, материалах, музыке и писаниях —
          ассистент найдёт их в сервисах портала и покажет карточками.
        </p>
      </div>
      {state.enabled ? (
        <AssistantView
          state={state}
          initialThread={thread}
          initialQuestion={question}
        />
      ) : (
        <p className="rounded-2xl border border-glass-brd bg-glass px-4 py-6 text-center text-sm text-text-1">
          Ассистент сейчас выключен администрацией. Загляните позже.
        </p>
      )}
    </main>
  );
}
