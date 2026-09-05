"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import type {
  ChatAttachmentDto,
  ChatMessageDto,
  ChatReactionSummary,
} from "@vedamatch/shared";
import { CHAT_REACTION_EMOJIS } from "@vedamatch/shared";
import { authorPalette } from "./chat-author-color";
import { formatBytes, formatDuration } from "./chat-time";
import { ChatVoicePlayer } from "./chat-voice-player";

/**
 * Сообщение в переписке — по макету канвы: имя автора первой строкой внутри
 * пузыря, время и галочка прочтения строкой под ним, знак автора слева по
 * нижнему краю пузыря.
 *
 * Действия (ответить, реакция, закрепить) не висят под каждым сообщением:
 * пятьдесят сообщений давали пятьдесят рядов кнопок, и лента превращалась
 * в частокол. Мышь показывает их при наведении, палец — по касанию пузыря.
 */
export function ChatMessage({
  message,
  mine,
  showAuthor,
  avatar,
  canPin,
  pinned,
  threadHref,
  forwardHref,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onReport,
  onPin,
  pending = false,
}: {
  message: ChatMessageDto;
  mine: boolean;
  /** В группе и канале имя автора рисуется в первом сообщении подряд. */
  showAuthor: boolean;
  /**
   * Знак автора слева от пузыря. В группе он важнее имени: подряд идущие
   * сообщения одного человека имя не повторяют, а по аватару видно сразу.
   * В личном диалоге его нет — там собеседник один и он в шапке.
   */
  avatar?: ReactNode;
  canPin: boolean;
  pinned: boolean;
  /** Ссылка на обсуждение поста — только в канале. */
  threadHref?: string;
  /** Ссылка на экран пересылки этого сообщения. */
  forwardHref?: string;
  onReply: (message: ChatMessageDto) => void;
  onReact: (message: ChatMessageDto, emoji: string) => void;
  onEdit: (message: ChatMessageDto) => void;
  onDelete: (message: ChatMessageDto) => void;
  onReport: (message: ChatMessageDto) => void;
  onPin: (message: ChatMessageDto, pinned: boolean) => void;
  /** Отправлено, но сервер ещё не ответил. */
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const deleted = Boolean(message.deletedAt);
  const palette = authorPalette(message.author.id);

  const bubble = mine
    ? "rounded-[20px] rounded-br-md border border-cyan/30"
    : "rounded-[20px] rounded-bl-md border border-glass-brd";
  const bubbleStyle: CSSProperties = mine
    ? {
        background:
          "var(--chat-bubble-mine, linear-gradient(to bottom right, color-mix(in srgb, var(--vm-cyan) 24%, transparent), color-mix(in srgb, var(--vm-mint-from) 10%, transparent)))",
        color: "var(--chat-bubble-mine-ink, var(--vm-text-0))",
      }
    : {
        background: "var(--chat-bubble-theirs, var(--vm-glass))",
        color: "var(--chat-bubble-theirs-ink, var(--vm-text-0))",
      };

  return (
    <div
      className={`group flex w-full flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
    >
      <div
        className={`flex w-full items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}
      >
        {avatar && !mine && (
          // Знак равняется по нижнему краю пузыря, как на макете: время и
          // реакции идут ниже отдельной строкой и на выравнивание не влияют.
          <span className="w-8 shrink-0">{avatar}</span>
        )}
        {/*
          Пузырь — текст, а не кнопка.

          Раньше нажатие по нему разворачивало панель действий: любое касание
          сообщения «выделяло» его, повторное гасило, а выделить текст пальцем
          было нельзя вовсе — жест уходил в обработчик. Скринридер при этом
          читал каждое сообщение как кнопку «Действия с сообщением».

          Панель открывает отдельная кнопка рядом. На устройстве с мышью она
          по-прежнему появляется при наведении — там это дешевле нажатия.
        */}
        <div
          style={bubbleStyle}
          className={`max-w-[85%] select-text px-3.5 py-2.5 text-left ${bubble} shadow-lg shadow-black/20`}
        >
          {deleted ? (
            <span className="block text-[15px] italic leading-[21px] text-text-2">
              Сообщение удалено
            </span>
          ) : (
            <>
              {showAuthor && !mine && (
                <span
                  className={`mb-1 block text-xs font-semibold ${palette.name}`}
                >
                  {message.author.name}
                </span>
              )}

              {message.forwardedFrom && (
                // Подпись-снимок: исходной беседы у получателя может не быть
                // вовсе, и ссылка «открыть оригинал» вела бы в никуда.
                <span className="mb-1 flex items-center gap-1 text-[11px] text-text-2">
                  <ForwardIcon />
                  {/* «Переслано от Мадхава» просит родительный падеж, а
                      склонять имена — гиблое дело: духовные имена, женские
                      и мужские формы. Точка вместо предлога честнее. */}
                  Переслано · {message.forwardedFrom}
                </span>
              )}

              {message.replyTo && (
                <span className="mb-2 flex gap-2.5 rounded-lg bg-bg-0/35 py-1.5 pr-2.5">
                  <span
                    className="w-[3px] shrink-0 rounded-sm"
                    style={{ background: "var(--chat-accent, var(--vm-cyan))" }}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: "var(--chat-accent, var(--vm-cyan))" }}
                    >
                      {message.replyTo.authorName}
                    </span>
                    <span className="truncate text-xs leading-4 text-text-1">
                      {message.replyTo.body ||
                        (message.replyTo.attachmentKind
                          ? "Вложение"
                          : "Сообщение удалено")}
                    </span>
                  </span>
                </span>
              )}

              {message.attachments.length > 0 && (
                // mb-3, а не mb-2: фото теперь во всю ширину пузыря (см.
                // Attachment ниже), и рядом с текстом-подписью на том же
                // расстоянии, что и между вложениями, читалось единым блоком
                // с текстом — как будто это подпись к фото, а не отдельное
                // сообщение. Скруглённые углы фото уже отделяют его по форме,
                // не хватало только воздуха.
                <span className="mb-3 flex flex-col gap-2.5">
                  {message.attachments.map((attachment) => (
                    <Attachment key={attachment.id} attachment={attachment} />
                  ))}
                </span>
              )}

              {message.body && (
                <span className="block whitespace-pre-wrap break-words text-[15px] leading-[21px]">
                  {message.body}
                </span>
              )}
            </>
          )}
        </div>

        {/* Кнопка действий: то, что раньше делало нажатие по самому пузырю.
            Порядок в строке ставит её со стороны, свободной от аватара, —
            чтобы она не наезжала на знак собеседника. */}
        {!deleted && (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-label={open ? "Скрыть действия" : "Действия с сообщением"}
            className={`flex size-8 shrink-0 items-center justify-center self-end rounded-full text-text-2 transition-opacity hover:text-text-0 ${
              mine ? "order-first" : ""
            } ${
              open
                ? "opacity-100"
                : "opacity-60 group-hover:opacity-100 group-focus-within:opacity-100"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        )}
      </div>

      {/* Время под пузырём, а не внутри: в пузыре оно врезается в последнюю
          строку и на коротком сообщении спорит с текстом за место. */}
      <div
        className={`flex w-full items-center gap-1.5 px-1.5 ${
          mine ? "justify-end" : avatar ? "pl-10" : ""
        }`}
      >
          {pinned && (
            <span className="flex items-center gap-1 text-[10px] text-gold">
              <PinIcon />
              закреплено
            </span>
          )}
          {message.editedAt && !deleted && (
            <span className="text-[10px] text-text-2">изменено</span>
          )}
          {/* У ещё не доехавшего время не показываем: оно проставится
              сервером, и показанное сейчас разошлось бы с ним на секунды. */}
          {pending ? (
            <span className="text-[10px] text-text-2">отправляется…</span>
          ) : (
            <span className="font-mono text-[10px] text-text-2">
              {new Date(message.createdAt).toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {mine && !deleted && !pending && (
            <ReadMark read={Boolean(message.readByOthers)} />
          )}
          {typeof message.viewsCount === "number" && message.viewsCount > 0 && (
            <span className="flex items-center gap-1 text-text-2">
              <EyeIcon />
              <span className="font-mono text-[10px]">{message.viewsCount}</span>
            </span>
          )}
        </div>

        {threadHref && !deleted && (
          <Link
            href={threadHref}
            style={{ color: "var(--chat-accent, var(--vm-cyan))" }}
            className="px-1.5 text-[13px] font-semibold hover:underline"
          >
            {message.commentsCount
              ? `Комментарии · ${message.commentsCount}`
              : "Обсудить"}
          </Link>
        )}

      {message.reactions.length > 0 && (
        <div
          className={`flex w-full gap-1.5 px-1.5 ${
            mine ? "justify-end" : avatar ? "pl-10" : ""
          }`}
        >
            {message.reactions.map((reaction) => (
              <ReactionChip
                key={reaction.emoji}
                reaction={reaction}
                onClick={() => onReact(message, reaction.emoji)}
              />
            ))}
          </div>
        )}

      {!deleted && (
        <div
          className={`flex w-full items-center gap-1 px-1 transition-opacity ${
            mine ? "justify-end" : avatar ? "pl-9" : ""
          } ${open ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"}`}
          >
            <SmallButton onClick={() => onReply(message)} label="Ответить" />
            <CopyButton body={message.body} />
            <SmallButton
              onClick={() => setPickerOpen((current) => !current)}
              label="Реакция"
            />
            {canPin && (
              <SmallButton
                onClick={() => onPin(message, !pinned)}
                label={pinned ? "Открепить" : "Закрепить"}
              />
            )}
            {forwardHref && (
              <Link
                href={forwardHref}
                className="rounded-lg px-2 py-1 text-[11px] text-text-2 transition-colors hover:text-text-0"
              >
                Переслать
              </Link>
            )}
            {mine ? (
              <>
                <SmallButton onClick={() => onEdit(message)} label="Изменить" />
                <SmallButton onClick={() => onDelete(message)} label="Удалить" />
              </>
            ) : (
              <SmallButton
                onClick={() => setMenuOpen((current) => !current)}
                label="Ещё"
              />
            )}
          </div>
        )}

        {pickerOpen && (
          <div
            className={`flex flex-wrap gap-1 rounded-2xl border border-glass-brd bg-glass p-1.5 ${
              mine ? "self-end" : "self-start"
            }`}
          >
            {CHAT_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact(message, emoji);
                  setPickerOpen(false);
                }}
                className="flex size-11 items-center justify-center rounded-xl text-lg transition-colors hover:bg-white/10"
                aria-label={`Реакция ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {menuOpen && (
          <button
            type="button"
            onClick={() => {
              onReport(message);
              setMenuOpen(false);
            }}
            className="self-start rounded-xl border border-magenta/26 px-3 py-1.5 text-xs font-semibold text-magenta"
          >
            Пожаловаться
          </button>
        )}
    </div>
  );
}

function Attachment({ attachment }: { attachment: ChatAttachmentDto }) {
  if (attachment.kind === "image")
    return (
      // Отрицательные поля гасят паддинг пузыря (px-3.5): фото идёт в край
      // по бокам, а не остаётся в рамке из подложки пузыря вокруг картинки.
      <a
        href={attachment.url ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="-mx-3.5 block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url ?? ""}
          alt=""
          className="max-h-72 w-[calc(100%+1.75rem)] rounded-lg object-cover"
        />
      </a>
    );

  if (attachment.kind === "voice")
    return (
      <ChatVoicePlayer
        url={attachment.url ?? ""}
        waveform={attachment.waveform ?? []}
        duration={formatDuration(attachment.durationSec)}
      />
    );

  if (attachment.kind === "file")
    return (
      <a
        href={attachment.url ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-xl border border-glass-brd bg-white/5 p-2.5"
      >
        <span className="flex size-10 items-center justify-center rounded-lg bg-white/6 text-text-1">
          <FileIcon />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-text-0">
            {attachment.title ?? "Файл"}
          </span>
          <span className="font-mono text-[11px] text-text-2">
            {formatBytes(attachment.sizeBytes)}
          </span>
        </span>
      </a>
    );

  // Карточка чужого сервиса: снимок, а не ссылка на живой объект — оригинал
  // может быть уже изменён или удалён.
  const tint =
    attachment.kind === "story"
      ? "border-gold/26 bg-gold/8"
      : "border-glass-brd bg-white/5";
  return (
    <span className={`flex flex-col gap-2 rounded-xl border p-2.5 ${tint}`}>
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-gold">
        {sourceLabel(attachment)}
      </span>
      {attachment.previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.previewUrl}
          alt=""
          className="max-h-52 w-full rounded-lg object-cover"
        />
      )}
      <span className="font-display text-sm font-semibold leading-5 text-text-0">
        {attachment.title}
      </span>
      {attachment.body && (
        <span className="text-xs leading-4 text-text-1">{attachment.body}</span>
      )}
      {attachment.subtitle && (
        <span className="text-[11px] text-text-2">{attachment.subtitle}</span>
      )}
    </span>
  );
}

function sourceLabel(attachment: ChatAttachmentDto): string {
  if (attachment.kind === "story") return "Сторис · Вдохновение";
  if (attachment.kind === "notice") return "Объявление";
  if (attachment.kind === "listing") return "Товар · Рынок";
  return "Контакт";
}

function ReactionChip({
  reaction,
  onClick,
}: {
  reaction: ChatReactionSummary;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-xl border px-2 py-0.5 text-xs ${
        reaction.mine
          ? "border-cyan/34 bg-cyan/12 text-cyan"
          : "border-glass-brd bg-bg-1 text-text-1"
      }`}
      aria-pressed={reaction.mine}
    >
      <span>{reaction.emoji}</span>
      <span className="font-mono text-[10px]">{reaction.count}</span>
    </button>
  );
}

function ReadMark({ read }: { read: boolean }) {
  return read ? (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--chat-accent, var(--vm-cyan))" }}
      aria-label="прочитано"
    >
      <path d="M2 12.5l4 4L13 9" />
      <path d="M11 15l1.5 1.5L21 8" />
    </svg>
  ) : (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-text-2"
      aria-label="доставлено"
    >
      <path d="M4 12.5l4.5 4.5L20 6" />
    </svg>
  );
}

/**
 * Копирование текста сообщения.
 *
 * Отдельной кнопкой, а не «выделите и скопируйте»: на телефоне выделение
 * длинного сообщения пальцем — это отдельная задача, и раньше оно вдобавок
 * не работало вовсе (нажатие уходило в разворот панели). Копируется только
 * текст: вложения — файлы, их в буфер не положить.
 */
function CopyButton({ body }: { body: string }) {
  const [copied, setCopied] = useState(false);

  if (!body.trim()) return null;

  return (
    <SmallButton
      label={copied ? "Скопировано" : "Копировать"}
      onClick={() => {
        void navigator.clipboard
          .writeText(body)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => {
            // Буфер закрыт настройками браузера — текст на экране, и теперь
            // его наконец можно выделить руками.
          });
      }}
    />
  );
}

function SmallButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2 py-1 text-[11px] text-text-2 transition-colors hover:text-text-0"
    >
      {label}
    </button>
  );
}

function ForwardIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13 5l7 7-7 7" />
      <path d="M20 12H8a4 4 0 00-4 4v3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-label="просмотров"
    >
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 4h6l-1 6 4 3.5V16H6v-2.5L10 10z" />
      <path d="M12 16v4.5" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 3v5h5" />
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
    </svg>
  );
}
