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
 * «Быстрая конференция» — в шапке списка бесед.
 *
 * Место выбрано так: конференция — это разговор, а разговоры живут здесь;
 * рядом уже стоят «новая группа» и «открытые беседы», и человек, которому
 * нужно кого-то позвать, приходит именно сюда. Отдельного раздела портала
 * ради одной кнопки заводить незачем.
 *
 * Нажатие сразу заводит комнату и показывает готовую ссылку: ни формы, ни
 * выбора участников. Ссылка остаётся на экране, пока человек её не
 * отправит, — уводить его в комнату раньше значило бы отнять то, ради чего
 * он нажимал.
 */
export function QuickConferenceButton() {
  const [room, setRoom] = useState<ChatConferenceDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const created = await createChatConference();
      setRoom(created);
      // Копируем сразу: ссылку заводят, чтобы отправить, и лишнее нажатие
      // здесь — это лишний шаг в самом частом пути.
      setCopied(await copyText(created.url));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось открыть конференцию",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!room)
    return (
      <div className="mb-5">
        <button
          type="button"
          onClick={() => void open()}
          disabled={busy}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-glass-brd bg-glass px-4 py-3 text-left disabled:opacity-60"
        >
          <span>
            <span className="block text-sm font-medium text-text-0">
              {busy ? "Открываем комнату…" : "Быстрая конференция"}
            </span>
            <span className="block text-sm text-text-1">
              Ссылка, по которой входят сразу. До четырёх человек.
            </span>
          </span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-text-1"
            aria-hidden
          >
            <path d="M3.5 7.5h11v9h-11z" />
            <path d="M14.5 12l6-3.5v7z" />
          </svg>
        </button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-text-1">
            {error}
          </p>
        ) : null}
      </div>
    );

  return (
    <section className="mb-5 rounded-2xl border border-glass-brd bg-glass p-4">
      <h2 className="text-sm font-medium text-text-0">Конференция открыта</h2>
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
        {conferenceSeatsLine(room)}. {conferenceExpiryLine(room.expiresAt)}.
      </p>
      <p aria-live="polite" className="sr-only">
        {copied ? "Ссылка скопирована" : ""}
      </p>
    </section>
  );
}
