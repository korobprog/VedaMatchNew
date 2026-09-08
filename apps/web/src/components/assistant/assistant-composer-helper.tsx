"use client";

import { useEffect, useRef, useState } from "react";
import { Bot } from "lucide-react";
import { composeWithAssistant } from "@/lib/assistant-client";

/**
 * Помощник в поле ввода «Общения»: человек просит составить или поправить
 * сообщение, ассистент возвращает текст, а дальше — «Вставить» в поле или
 * «Отправить» сразу собеседнику. Ассистент ничего не шлёт сам: отправляет
 * тот же обработчик, что и обычную реплику.
 */
export function AssistantComposerHelper({
  recipientName,
  context,
  onInsert,
  onSend,
  onClose,
}: {
  recipientName: string | null;
  /** Последние реплики беседы, от старых к новым. */
  context: string[];
  onInsert: (text: string) => void;
  onSend: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const [request, setRequest] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function compose() {
    const text = request.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await composeWithAssistant({ text, recipientName, context });
      setDraft(result.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не отправилось");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Поле просьбы растёт под текст. Фиксированной высоты не хватало: длинная
   * просьба уходила за нижний край, и написанного было не видно — а править
   * формулировку, не видя её, нельзя. Потолок держит CSS (`max-h`), за ним
   * поле прокручивается.
   */
  const requestRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = requestRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [request]);
  /* Готовый текст растёт по тем же правилам: ответ в три абзаца — обычное
     дело, а читают его целиком, прежде чем отправить от своего имени. */
  useEffect(() => {
    const field = draftRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [draft]);

  return (
    <div
      role="group"
      aria-label="Помощник переписки"
      className="flex flex-col gap-2 rounded-2xl border border-cyan/34 bg-cyan/8 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan">
          <Bot className="size-4" aria-hidden />
          Ассистент
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть помощника"
          className="flex size-8 items-center justify-center rounded-lg text-text-2 hover:text-text-0"
        >
          ✕
        </button>
      </div>
      {error && (
        <p className="rounded-xl border border-magenta/30 bg-magenta/10 px-3 py-2 text-xs text-magenta">
          {error}
        </p>
      )}
      {/* Кнопка под полем, а не сбоку: рядом с ней на телефоне полю
          доставалось меньше двух третей ширины, и просьба в одну фразу
          разъезжалась на три строки. */}
      <div className="flex flex-col items-stretch gap-2">
        {/* Три строки, а не одна: в одну не помещалась даже подсказка
            («Что написать Сите? Например: „вежливо перенеси встречу"») — она
            обрезалась на середине, и было не видно, чего от поля ждут.
            Просьба к ассистенту — это фраза, а не слово. */}
        <textarea
          ref={requestRef}
          value={request}
          rows={3}
          onChange={(event) => setRequest(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void compose();
            }
          }}
          placeholder={
            recipientName
              ? `Что написать ${recipientName}? Например: «вежливо перенеси встречу»`
              : "Что написать? Например: «поблагодари за помощь»"
          }
          aria-label="Просьба ассистенту"
          className="max-h-[30svh] min-h-20 w-full resize-none rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
        <button
          type="button"
          onClick={() => void compose()}
          disabled={busy || !request.trim()}
          className="btn-mint self-end rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy && !draft ? "Пишу…" : "Составить"}
        </button>
      </div>
      {draft !== null && (
        <div className="flex flex-col gap-2">
          {/* Готовый текст читают целиком, прежде чем отправить от своего
              имени: в три строки ответ в пару абзацев смотрелся через щёлку.
              Верхняя граница в 40% высоты экрана оставляет на виду и саму
              переписку, и кнопки под полем. Ручное растягивание сохранено. */}
          <textarea
            ref={draftRef}
            value={draft}
            rows={7}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Текст от ассистента"
            className="max-h-[40svh] min-h-40 w-full resize-y rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !draft.trim()}
              className="btn-mint rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              Отправить
            </button>
            <button
              type="button"
              onClick={() => {
                onInsert(draft);
                onClose();
              }}
              disabled={!draft.trim()}
              className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
            >
              Вставить в поле
            </button>
            <button
              type="button"
              onClick={() => void compose()}
              disabled={busy}
              className="rounded-xl px-3 py-2 text-sm text-text-2 hover:text-text-0 disabled:opacity-50"
            >
              Ещё вариант
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
