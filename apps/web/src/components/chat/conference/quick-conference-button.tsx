"use client";

import Link from "next/link";
import { useState } from "react";
import type { ChatConferenceDto } from "@vedamatch/shared";
import { copyText } from "@/lib/copy-text";
import { createChatConference } from "@/lib/chat-conference-api";
import {
  conferenceExpiryLine,
  conferenceSeatsLine,
} from "./conference-join-step";

/**
 * «Быстрая конференция» — кнопка со значком в верхнем ряду «Общения»
 * (VED-730). Раньше это была широкая подпись во весь список; теперь значок
 * стоит в ряду остальных четырёх кнопок, а слова ушли в подсказку.
 *
 * Действия прежние: нажатие сразу заводит комнату и копирует ссылку; готовая
 * ссылка остаётся на экране (панелью под кнопкой), пока человек её не
 * отправит, — уводить его в комнату раньше значило бы отнять то, ради чего
 * он нажимал. Повторное нажатие открывает ту же панель с той же ссылкой.
 */
export function QuickConferenceButton() {
  const [room, setRoom] = useState<ChatConferenceDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const created = await createChatConference();
      setRoom(created);
      setPanelOpen(true);
      // Копируем сразу: ссылку заводят, чтобы отправить, и лишнее нажатие
      // здесь — это лишний шаг в самом частом пути.
      setCopied(await copyText(created.url));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось открыть конференцию",
      );
      setPanelOpen(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (room ? setPanelOpen(true) : void open())}
        disabled={busy}
        aria-label="Быстрая конференция"
        aria-busy={busy}
        title="Быстрая конференция: ссылка, по которой входят сразу, до четырёх человек"
        className="flex size-11 items-center justify-center rounded-2xl border border-glass-brd bg-glass text-text-1 transition-colors hover:text-text-0 disabled:opacity-60"
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
          <path d="M3.5 7.5h11v9h-11z" />
          <path d="M14.5 12l6-3.5v7z" />
        </svg>
      </button>
      {panelOpen && (room || error) && (
        <section className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-glass-brd bg-glass p-4">
          {room ? (
            <>
              <h2 className="text-sm font-medium text-text-0">
                Конференция открыта
              </h2>
              <p className="mt-1 text-sm text-text-1">
                Отправьте ссылку — вошедший по ней окажется сразу в комнате.
              </p>
              <p className="mt-3 break-all rounded-xl border border-glass-brd px-3 py-2 font-mono text-sm text-text-0">
                {room.url}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyText(room.url).then(setCopied)}
                  className="min-h-11 rounded-xl border border-mint-edge bg-mint px-4 text-sm font-medium text-on-mint"
                >
                  {copied ? "Скопировано" : "Скопировать ссылку"}
                </button>
                <Link
                  href={`/chat/${room.conversationId}`}
                  className="flex min-h-11 items-center rounded-xl border border-glass-brd px-4 text-sm text-text-0"
                >
                  Открыть комнату
                </Link>
              </div>
              <p className="mt-3 text-sm text-text-2">
                {conferenceSeatsLine(room)}.{" "}
                {conferenceExpiryLine(room.expiresAt)}.
              </p>
              <p aria-live="polite" className="sr-only">
                {copied ? "Ссылка скопирована" : ""}
              </p>
            </>
          ) : (
            <p role="alert" className="text-sm text-text-1">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="mt-3 min-h-11 rounded-xl border border-glass-brd px-4 text-sm text-text-1 transition-colors hover:text-text-0"
          >
            Закрыть
          </button>
        </section>
      )}
    </div>
  );
}
