"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { ChatConferenceDto } from "@vedamatch/shared";
import { copyText } from "@/lib/copy-text";
import {
  getChatConference,
  revokeChatConference,
  rotateChatConferenceLink,
} from "@/lib/chat-conference-api";
import { useGroupCalls } from "../calls/group/group-call-context";
import { conferenceSeatsLine } from "./conference-join-step";
import {
  conferenceActionNote,
  conferenceCallCta,
  conferencePanelView,
} from "./conference-panel";

/**
 * Панель конференции — в самой комнате, под шапкой беседы.
 *
 * Зачем она здесь. Ссылку заводят на экране списка бесед и там же
 * копируют, но нужна она второй раз почти всегда: «пришли не все»,
 * «перешлите ещё Свете», «ссылка ушла не в тот чат». До этой панели
 * второго раза не было вовсе — ручки `GET/POST chat/conference/:id` были,
 * а экрана у них не было.
 *
 * Панель показывается только в комнате, заведённой конференцией
 * (`isConference` у беседы). В обычной группе её нет: у обычной группы нет
 * двери, которую можно закрыть.
 *
 * Разговор запускается отсюда же. Вошедший по ссылке попадает в беседу, и
 * до этой кнопки ему оставалось догадаться нажать значок звонка в шапке —
 * хотя звали его именно разговаривать. Кнопка та же самая
 * (`startOrJoin` из контекста групповых звонков), просто названная словами.
 */
export function ConferenceRoomPanel({
  conversationId,
}: {
  conversationId: string;
}) {
  const [room, setRoom] = useState<ChatConferenceDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const calls = useGroupCalls();
  const linkId = useId();

  useEffect(() => {
    let alive = true;
    getChatConference(conversationId)
      .then((dto) => {
        if (alive) setRoom(dto);
      })
      // Молча: беседа могла перестать быть конференцией, пока экран был
      // открыт, и ругаться на это человеку незачем — панель просто исчезнет.
      .catch(() => {
        if (alive) setRoom(null);
      });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const run = useCallback(
    async (
      action: "copied" | "revoked" | "rotated",
      task: () => Promise<ChatConferenceDto | boolean>,
    ) => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const result = await task();
        if (typeof result === "boolean") {
          if (!result) throw new Error("Скопируйте ссылку вручную");
        } else setRoom(result);
        setNote(conferenceActionNote(action));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Не получилось");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (!room) return null;
  const view = conferencePanelView(room);

  return (
    <section
      aria-labelledby={`${linkId}-title`}
      className="mb-3 rounded-2xl border border-glass-brd bg-glass p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {/* Не заголовок уровня документа: h1 беседы — её название, а
            порядок h1→h2→h3 ломать декоративной панелью нельзя. */}
        <p
          id={`${linkId}-title`}
          className={`text-sm font-medium ${
            view.tone === "open" ? "text-text-0" : "text-text-1"
          }`}
        >
          {view.title}
        </p>
        <p className="text-sm text-text-2">{conferenceSeatsLine(room)}</p>
      </div>
      <p className="mt-1 text-sm text-text-1">{view.hint}</p>

      {view.showLink && (
        <p
          id={linkId}
          className="mt-3 break-all rounded-xl border border-glass-brd px-3 py-2 font-mono text-sm text-text-0"
        >
          {room.url}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {view.showLink && (
          <button
            type="button"
            disabled={busy}
            aria-describedby={linkId}
            onClick={() => void run("copied", () => copyText(room.url))}
            className="min-h-11 rounded-xl border border-mint-edge bg-mint px-4 text-sm font-medium text-on-mint disabled:opacity-60"
          >
            Скопировать ссылку
          </button>
        )}
        {calls && (
          <button
            type="button"
            onClick={() => void calls.startOrJoin(conversationId)}
            className="min-h-11 rounded-xl border border-glass-brd px-4 text-sm text-text-0"
          >
            {conferenceCallCta(room)}
          </button>
        )}
        {view.showRevoke && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run("revoked", () => revokeChatConference(conversationId))
            }
            className="min-h-11 rounded-xl border border-glass-brd px-4 text-sm text-text-0 disabled:opacity-60"
          >
            Закрыть вход
          </button>
        )}
        {view.showRotate && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run("rotated", () =>
                rotateChatConferenceLink(conversationId),
              )
            }
            className="min-h-11 rounded-xl border border-glass-brd px-4 text-sm text-text-0 disabled:opacity-60"
          >
            {view.rotateLabel}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-text-1">
          {error}
        </p>
      )}
      {/* Итог действия — вслух для скринридера и надписью для всех
          остальных: кнопки не меняют подпись, и без этой строки «закрыть
          вход» выглядит как нажатие, которое ничего не сделало. */}
      <p aria-live="polite" className="mt-2 text-sm text-text-2">
        {note ?? ""}
      </p>
    </section>
  );
}
