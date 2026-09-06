"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, MessageSquareShare, Plus, Trash2 } from "lucide-react";
import type {
  AssistantMessageDto,
  AssistantQuotaState,
  AssistantStateDto,
  AssistantThreadDetail,
  AssistantThreadDto,
} from "@vedamatch/shared";
import {
  askAssistant,
  decideAssistantAction,
  deleteAssistantThread,
  loadAssistantThread,
} from "@/lib/assistant-client";
import { AssistantActionCardView, AssistantLinkCardView } from "./assistant-cards";
import { buildShareHref } from "./assistant-share";

/** Подсказки на пустом экране — что ассистент умеет прямо сейчас. */
const SUGGESTIONS = [
  "Найди книги Прабхупады на Рынке",
  "Подбери цитату о терпении из Гиты",
  "Что есть в Образовании про джапу?",
  "Какие киртаны послушать вечером?",
  "Есть ли объявления о программах в моём городе?",
  "Составь короткое поздравление другу с Джанмаштами",
];

/**
 * Страница ассистента: беседы слева (на широком экране), переписка справа.
 * Вопрос из адреса (`?q=`) уходит сразу — так работает полоса на главной.
 */
export function AssistantView({
  state,
  initialThread,
  initialQuestion,
}: {
  state: AssistantStateDto;
  initialThread: AssistantThreadDetail | null;
  initialQuestion: string | null;
}) {
  const router = useRouter();
  const [threads, setThreads] = useState<AssistantThreadDto[]>(state.threads);
  const [thread, setThread] = useState<AssistantThreadDto | null>(
    initialThread?.thread ?? null,
  );
  const [messages, setMessages] = useState<AssistantMessageDto[]>(
    initialThread?.messages ?? [],
  );
  const [quota, setQuota] = useState<AssistantQuotaState>(state.quota);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const askedFromUrl = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  // Вопрос из адреса задаётся один раз: перезагрузка страницы не должна
  // тратить квоту на тот же вопрос повторно.
  useEffect(() => {
    if (!initialQuestion || askedFromUrl.current) return;
    askedFromUrl.current = true;
    void ask(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  async function ask(question: string) {
    const body = question.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    const optimistic: AssistantMessageDto = {
      id: `pending-${Date.now()}`,
      role: "user",
      text: body,
      cards: [],
      toolsUsed: [],
      failed: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const result = await askAssistant(thread?.id ?? null, body);
      setThread(result.thread);
      setThreads((current) => [
        result.thread,
        ...current.filter((item) => item.id !== result.thread.id),
      ]);
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimistic.id),
        result.userMessage,
        result.assistantMessage,
      ]);
      setQuota(result.quota);
      if (!thread) router.replace(`/assistant?thread=${result.thread.id}`);
    } catch (e) {
      setMessages((current) =>
        current.filter((message) => message.id !== optimistic.id),
      );
      setText(body);
      setError(e instanceof Error ? e.message : "Не получилось спросить");
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    if (busy) return;
    setError(null);
    try {
      const detail = await loadAssistantThread(id);
      setThread(detail.thread);
      setMessages(detail.messages);
      router.replace(`/assistant?thread=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Беседа не открылась");
    }
  }

  function startNew() {
    if (busy) return;
    setThread(null);
    setMessages([]);
    setError(null);
    router.replace("/assistant");
  }

  async function remove(id: string) {
    try {
      await deleteAssistantThread(id);
      setThreads((current) => current.filter((item) => item.id !== id));
      if (thread?.id === id) startNew();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалилось");
    }
  }

  async function decide(messageId: string, index: number, confirm: boolean) {
    if (!thread) return;
    const key = `${messageId}:${index}`;
    setPendingCard(key);
    setError(null);
    try {
      const result = await decideAssistantAction(thread.id, {
        messageId,
        index,
        confirm,
      });
      setMessages((current) => {
        const next = current.map((message) =>
          message.id === result.message.id ? result.message : message,
        );
        return result.followUp ? [...next, result.followUp] : next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setPendingCard(null);
    }
  }

  const unlimited = quota.messagesPerDay <= 0;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <aside
        aria-label="Беседы"
        className="flex shrink-0 flex-col gap-2 lg:sticky lg:top-20 lg:w-64"
      >
        <button
          type="button"
          onClick={startNew}
          className="flex items-center justify-center gap-2 rounded-xl border border-glass-brd bg-glass px-3 py-2 text-sm font-medium text-text-0 hover:border-cyan/40"
        >
          <Plus className="size-4" aria-hidden />
          Новая беседа
        </button>
        {threads.length > 0 && (
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {threads.map((item) => (
              <li key={item.id} className="group flex shrink-0 items-center gap-1 lg:shrink">
                <button
                  type="button"
                  onClick={() => void open(item.id)}
                  aria-current={thread?.id === item.id ? "true" : undefined}
                  className="max-w-56 flex-1 truncate rounded-xl px-3 py-2 text-left text-sm text-text-1 hover:bg-glass hover:text-text-0 aria-[current=true]:bg-glass aria-[current=true]:text-text-0 lg:max-w-none"
                >
                  {item.title || "Без названия"}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(item.id)}
                  aria-label={`Удалить беседу «${item.title || "Без названия"}»`}
                  className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-text-2 hover:text-magenta lg:flex"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="flex min-h-[60dvh] min-w-0 flex-1 flex-col rounded-3xl border border-glass-brd bg-bg-1/60 p-3 sm:p-4">
        <div className="flex-1 space-y-4">
          {messages.length === 0 && !busy && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl border border-cyan/34 bg-cyan/12 text-cyan">
                <Bot className="size-7" aria-hidden />
              </span>
              <div>
                <p className="font-display text-lg font-semibold text-text-0">
                  Спросите о чём угодно на портале
                </p>
                <p className="mt-1 max-w-md text-sm text-text-1">
                  Ассистент ищет по Рынку, Объявлениям, Вдохновению,
                  Образованию, Музыке и Библиотеке, помогает составить текст и
                  по вашей просьбе публикует рилс.
                </p>
              </div>
              <ul className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      onClick={() => void ask(suggestion)}
                      className="rounded-full border border-glass-brd bg-glass px-3 py-1.5 text-xs text-text-1 hover:border-cyan/40 hover:text-text-0"
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((message) => (
            <MessageView
              key={message.id}
              message={message}
              pendingCard={pendingCard}
              onDecide={(index, confirm) =>
                void decide(message.id, index, confirm)
              }
            />
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-sm text-text-2" role="status">
              <span className="size-2 animate-pulse rounded-full bg-cyan" />
              Ассистент думает…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="mt-4 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(text);
          }}
        >
          {error && (
            <p className="rounded-xl border border-magenta/30 bg-magenta/10 px-3 py-2 text-xs text-magenta">
              {error}
            </p>
          )}
          {!quota.available && quota.unavailableReason && (
            <p className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-text-1">
              {quota.unavailableReason}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              rows={1}
              disabled={!quota.available || busy}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask(text);
                }
              }}
              placeholder="Вопрос ассистенту…"
              aria-label="Вопрос ассистенту"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-glass-brd bg-glass px-3.5 py-3 text-[15px] text-text-0 placeholder:text-text-2 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!quota.available || busy || !text.trim()}
              aria-label="Спросить"
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-mint-edge bg-mint text-on-mint disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4.5 19.5L21 12 4.5 4.5 7 12z" />
                <path d="M7 12h14" />
              </svg>
            </button>
          </div>
          <p className="text-[11px] text-text-2">
            {unlimited
              ? "Ассистент может ошибаться — проверяйте важное в самом сервисе."
              : `Осталось вопросов сегодня: ${quota.messagesLeft} из ${quota.messagesPerDay}. Ассистент может ошибаться — проверяйте важное в самом сервисе.`}
          </p>
        </form>
      </section>
    </div>
  );
}

function MessageView({
  message,
  pendingCard,
  onDecide,
}: {
  message: AssistantMessageDto;
  pendingCard: string | null;
  onDecide: (index: number, confirm: boolean) => void;
}) {
  const mine = message.role === "user";
  const shareHref = mine ? null : buildShareHref(message);
  return (
    <article
      className={`flex flex-col gap-2 ${mine ? "items-end" : "items-start"}`}
      aria-label={mine ? "Ваш вопрос" : "Ответ ассистента"}
    >
      <div
        className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-6 sm:max-w-[80%] ${
          mine
            ? "bg-cyan/12 text-text-0"
            : message.failed
              ? "border border-magenta/30 bg-magenta/10 text-text-0"
              : "border border-glass-brd bg-bg-1 text-text-0"
        }`}
      >
        {message.text}
      </div>
      {message.cards.length > 0 && (
        <div className="grid w-full gap-2 sm:max-w-[80%] sm:grid-cols-2">
          {message.cards.map((card, index) =>
            card.kind === "link" ? (
              <AssistantLinkCardView key={`${card.href}-${index}`} card={card} />
            ) : (
              <div key={`action-${index}`} className="sm:col-span-2">
                <AssistantActionCardView
                  card={card}
                  busy={pendingCard === `${message.id}:${index}`}
                  onDecide={(confirm) => onDecide(index, confirm)}
                />
              </div>
            ),
          )}
        </div>
      )}
      {shareHref && (
        <Link
          href={shareHref}
          className="flex items-center gap-1.5 text-xs text-text-2 hover:text-cyan"
        >
          <MessageSquareShare className="size-3.5" aria-hidden />
          Отправить в чат
        </Link>
      )}
    </article>
  );
}
