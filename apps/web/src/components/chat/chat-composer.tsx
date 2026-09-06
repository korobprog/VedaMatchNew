"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  ChatAttachmentInput,
  ChatMessageDto,
} from "@vedamatch/shared";
import { uploadChatFile } from "@/lib/chat-client";
import { AssistantComposerHelper } from "@/components/assistant/assistant-composer-helper";
import {
  ATTACH_DRAG_TYPE,
  AttachTileIcon,
  ChatAttachSheet,
  attachTileMeta,
  tileToneClass,
} from "./chat-attach-sheet";
import {
  CHAT_QUICK_SLOT_STORAGE_KEY,
  DEFAULT_CHAT_QUICK_SLOT,
  effectiveQuickSlot,
  parseQuickSlot,
  type ChatQuickSlotId,
} from "./chat-quick-slot";
import { formatDuration } from "./chat-time";
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
  assistant,
}: {
  conversationId: string;
  /**
   * Помощник переписки — портальный ассистент в поле ввода. Пусто — выключен
   * администратором или беседа без собеседника. Контекст даёт чат: ассистент
   * его переписку не читает.
   */
  assistant?: { recipientName: string | null; context: string[] } | null;
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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [pinned, setPinned] = useState<ChatQuickSlotId>(DEFAULT_CHAT_QUICK_SLOT);
  const [dropHover, setDropHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);

  /* Быстрый слот читается эффектом: на сервере `localStorage` нет, и ленивый
     `useState` дал бы расхождение гидратации — как у панели горячих кнопок. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий выше. */
    try {
      setPinned(parseQuickSlot(window.localStorage.getItem(CHAT_QUICK_SLOT_STORAGE_KEY)));
    } catch {
      setPinned(DEFAULT_CHAT_QUICK_SLOT);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function pin(id: ChatQuickSlotId) {
    setPinned(id);
    try {
      window.localStorage.setItem(CHAT_QUICK_SLOT_STORAGE_KEY, id);
    } catch {
      // Приватный режим: выбор живёт до конца сессии.
    }
  }

  const quickId = effectiveQuickSlot(pinned, { assistantEnabled: Boolean(assistant) });
  const quickMeta = attachTileMeta(quickId);
  const quickActions: Partial<Record<ChatQuickSlotId, () => void>> = {
    photo: () => imageInput.current?.click(),
    file: () => fileInput.current?.click(),
    emoji: () => setEmojiOpen((open) => !open),
    assistant: () => setAssistantOpen((open) => !open),
  };

  /**
   * Правка начинается с прежнего текста сообщения.
   *
   * Раньше поле оставалось пустым, а «Сохранить» на пустом поле молча ничего
   * не делало — со стороны это выглядело как «изменить нельзя». Состояние
   * подгоняется прямо на рендере, а не эффектом: так текст виден в том же
   * кадре, где появилась полоска «Изменение сообщения».
   *
   * Начатое письмо при этом не теряется: черновик откладывается и
   * возвращается, когда правку отменили или сохранили.
   */
  const editingId = editing?.id ?? null;
  const [editingShown, setEditingShown] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  if (editingId !== editingShown) {
    // Черновик откладываем только на входе в правку: при переходе от одного
    // сообщения к другому он уже отложен.
    if (editingId && editingShown === null) setDraft(text);
    setEditingShown(editingId);
    setText(editingId ? (editing?.body ?? "") : (draft ?? ""));
    if (!editingId) setDraft(null);
  }

  if (disabled)
    return (
      <p className="rounded-2xl border border-glass-brd bg-glass px-4 py-3 text-center text-[13px] text-text-1">
        {disabledReason ?? "Писать сюда нельзя"}
      </p>
    );

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
            Изменение сообщения — было: «{editing.body}»
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
          onOpenAssistant={
            assistant
              ? () => {
                  setAssistantOpen(true);
                  setSheetOpen(false);
                }
              : undefined
          }
          pinned={quickId}
          onPin={(id) => {
            pin(id);
            setSheetOpen(false);
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {assistantOpen && assistant && (
        <AssistantComposerHelper
          recipientName={assistant.recipientName}
          context={assistant.context}
          onInsert={(draft) =>
            setText((current) =>
              current.trim() ? `${current.trimEnd()}\n${draft}` : draft,
            )
          }
          onSend={(draft) => onSend(draft, [])}
          onClose={() => setAssistantOpen(false)}
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

        {/* Быстрый слот: одна плитка панели вложений под рукой. Принимает
            перетащенную плитку; чем занят — решает человек, см. chat-quick-slot.ts. */}
        {quickMeta.href ? (
          <Link
            href={quickMeta.href}
            aria-label={quickMeta.label}
            title={`${quickMeta.label} — быстрый слот`}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(ATTACH_DRAG_TYPE)) {
                event.preventDefault();
                setDropHover(true);
              }
            }}
            onDragLeave={() => setDropHover(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDropHover(false);
              pin(parseQuickSlot(event.dataTransfer.getData(ATTACH_DRAG_TYPE)));
            }}
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border transition-colors ${tileToneClass(quickMeta.tone)} ${dropHover ? "ring-2 ring-magenta" : ""}`}
          >
            <AttachTileIcon id={quickId} />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => quickActions[quickId]?.()}
            aria-label={quickMeta.label}
            aria-expanded={
              quickId === "assistant"
                ? assistantOpen
                : quickId === "emoji"
                  ? emojiOpen
                  : undefined
            }
            title={`${quickMeta.label} — быстрый слот`}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(ATTACH_DRAG_TYPE)) {
                event.preventDefault();
                setDropHover(true);
              }
            }}
            onDragLeave={() => setDropHover(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDropHover(false);
              pin(parseQuickSlot(event.dataTransfer.getData(ATTACH_DRAG_TYPE)));
            }}
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border transition-colors ${tileToneClass(quickMeta.tone)} ${dropHover ? "ring-2 ring-magenta" : ""}`}
          >
            <AttachTileIcon id={quickId} />
          </button>
        )}

        {recording ? (
          // Поле ввода прячется на время записи: печатать и говорить в
          // микрофон разом всё равно нельзя, а таймер честнее показывает,
          // что происходит, чем неподвижный плейсхолдер позади кнопки.
          <span className="flex min-h-11 flex-1 items-center gap-2 rounded-2xl border border-magenta/30 bg-magenta/10 px-3.5 py-3 text-[15px] text-magenta">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-magenta/60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-magenta" />
            </span>
            Идёт запись… {formatDuration(recordedSeconds)}
          </span>
        ) : (
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
        )}

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
            onRecordingChange={(active, seconds) => {
              setRecording(active);
              setRecordedSeconds(seconds);
            }}
          />
        )}
      </div>
    </div>
  );
}
