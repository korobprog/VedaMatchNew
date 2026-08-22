"use client";

import { useRef, useState } from "react";
import type {
  ChatAttachmentInput,
  ChatMessageDto,
} from "@vedamatch/shared";
import { uploadChatFile } from "@/lib/chat-client";
import { ChatAttachSheet } from "./chat-attach-sheet";
import { ChatVoiceRecorder } from "./chat-voice-recorder";

/** Быстрый ряд смайликов — те же, что были в чате Знакомств. */
const QUICK_EMOJIS = ["😊", "🙏", "❤️", "😂", "👍", "🌸", "🕉️", "✨"];

/**
 * Поле ввода с вложениями. Файл уезжает в S3 сразу при выборе, а в сообщение
 * попадает уже ссылкой: иначе отправка большого файла выглядит как зависшая
 * кнопка, и человек жмёт её второй раз.
 */
export function ChatComposer({
  conversationId,
  replyTo,
  editing,
  disabled,
  disabledReason,
  onCancelReply,
  onCancelEdit,
  onSend,
  onSaveEdit,
  onTyping,
}: {
  conversationId: string;
  replyTo: ChatMessageDto | null;
  editing: ChatMessageDto | null;
  disabled?: boolean;
  disabledReason?: string;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (body: string, attachments: ChatAttachmentInput[]) => Promise<void>;
  onSaveEdit: (body: string) => Promise<void>;
  onTyping: () => void;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachmentInput[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);

  if (disabled)
    return (
      <p className="rounded-2xl border border-glass-brd bg-glass px-4 py-3 text-center text-[13px] text-text-1">
        {disabledReason ?? "Писать сюда нельзя"}
      </p>
    );

  const value = editing ? (editing.body ?? "") : text;

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const stored = await uploadChatFile(conversationId, file);
        setAttachments((current) => [
          ...current,
          {
            kind: stored.kind,
            url: stored.url,
            key: stored.key,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            width: stored.width,
            height: stored.height,
            title: stored.kind === "file" ? file.name : undefined,
          },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Файл не загрузился");
    } finally {
      setBusy(false);
      setSheetOpen(false);
    }
  }

  async function submit() {
    const body = text.trim();
    if (busy) return;
    if (editing) {
      if (!body) return;
      setBusy(true);
      try {
        await onSaveEdit(body);
        setText("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не сохранилось");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!body && attachments.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(body, attachments);
      setText("");
      setAttachments([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Сообщение не отправлено");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Отказ по правилу — не ошибка: «запрос даёт одно сообщение» объясняет
          устройство сервиса, и красный тут пугает на ровном месте. */}
      {error && (
        <p className="rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-xs text-cyan">
          {error}
        </p>
      )}

      {replyTo && !editing && (
        <div className="flex items-center gap-2.5 rounded-xl border border-glass-brd bg-glass px-3 py-2">
          <span className="h-8 w-[3px] rounded-sm bg-cyan" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] font-bold text-cyan">
              {replyTo.author.name}
            </span>
            <span className="truncate text-xs text-text-1">
              {replyTo.body || "Вложение"}
            </span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="flex size-11 items-center justify-center rounded-xl text-text-2 hover:text-text-0"
            aria-label="Отменить ответ"
          >
            ✕
          </button>
        </div>
      )}

      {editing && (
        <div className="flex items-center gap-2.5 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2">
          <span className="flex-1 text-xs text-gold">
            Изменение сообщения — было: «{value}»
          </span>
          <button
            type="button"
            onClick={onCancelEdit}
            className="flex size-11 items-center justify-center rounded-xl text-text-2 hover:text-text-0"
            aria-label="Отменить изменение"
          >
            ✕
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <li
              key={`${attachment.url}-${index}`}
              className="flex items-center gap-2 rounded-xl border border-glass-brd bg-glass px-2.5 py-1.5 text-xs text-text-1"
            >
              <span>
                {attachment.kind === "image"
                  ? "Фото"
                  : attachment.kind === "voice"
                    ? "Голосовое"
                    : (attachment.title ?? "Файл")}
              </span>
              <button
                type="button"
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((_, i) => i !== index),
                  )
                }
                aria-label="Убрать вложение"
                className="text-text-2 hover:text-text-0"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {sheetOpen && (
        <ChatAttachSheet
          onPickImage={() => imageInput.current?.click()}
          onPickFile={() => fileInput.current?.click()}
          onOpenEmoji={() => {
            setEmojiOpen(true);
            setSheetOpen(false);
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {emojiOpen && (
        <div className="flex flex-wrap gap-1 rounded-2xl border border-glass-brd bg-glass p-2">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setText((current) => `${current}${emoji}`)}
              className="flex size-11 items-center justify-center rounded-xl text-lg hover:bg-white/10"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => void pick(event.target.files)}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
        hidden
        onChange={(event) => void pick(event.target.files)}
      />

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setSheetOpen((open) => !open)}
          aria-label="Вложение"
          aria-expanded={sheetOpen}
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-glass-brd bg-glass text-text-1 transition-colors hover:text-text-0"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>

        <textarea
          value={text}
          rows={1}
          onChange={(event) => {
            setText(event.target.value);
            onTyping();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={editing ? "Новый текст сообщения" : "Сообщение…"}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-glass-brd bg-glass px-3.5 py-3 text-[15px] text-text-0 outline-none placeholder:text-text-2"
        />

        {text.trim() || attachments.length > 0 || editing ? (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            aria-label={editing ? "Сохранить" : "Отправить"}
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-mint-edge bg-mint text-on-mint disabled:opacity-60"
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
              <path d="M4.5 19.5L21 12 4.5 4.5 7 12z" />
              <path d="M7 12h14" />
            </svg>
          </button>
        ) : (
          <ChatVoiceRecorder
            conversationId={conversationId}
            onRecorded={(attachment) =>
              setAttachments((current) => [...current, attachment])
            }
            onError={setError}
          />
        )}
      </div>
    </div>
  );
}
