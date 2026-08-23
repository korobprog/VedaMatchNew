"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChatColorTemplateDto, ChatConversationDetail } from "@vedamatch/shared";
import {
  deleteChatConversation,
  leaveChatConversation,
  reportChat,
  setChatMuted,
  setChatPinned,
  subscribeToChannel,
} from "@/lib/chat-client";
import { listColorTemplates, setConversationTheme } from "@/lib/chat-appearance-api";

/**
 * Меню беседы: без звука, закрепить, выйти, пожаловаться. Настройки живут
 * у каждого свои — беззвучный режим одного участника не выключает звук
 * остальным, поэтому все действия идут в его строку участия.
 */
export function ChatRoomMenu({
  conversation,
  onChange,
  onThemeChange,
}: {
  conversation: ChatConversationDetail;
  onChange: (patch: Partial<ChatConversationDetail>) => void;
  onThemeChange: (templateId: string | null) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [templates, setTemplates] = useState<ChatColorTemplateDto[] | null>(
    null,
  );

  useEffect(() => {
    if (!appearanceOpen || templates) return;
    void listColorTemplates().then((state) => setTemplates(state.templates));
  }, [appearanceOpen, templates]);

  async function applyTheme(templateId: string | null) {
    await setConversationTheme(conversation.id, templateId);
    onThemeChange(templateId);
    setAppearanceOpen(false);
    setOpen(false);
  }

  const isChannel = conversation.kind === "channel";
  const isMember = conversation.myRole !== "member" || !isChannel;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Меню беседы"
        className="flex size-11 items-center justify-center rounded-2xl text-text-1 hover:text-text-0"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-10 flex w-56 flex-col gap-1 rounded-2xl border border-glass-brd bg-bg-1 p-1.5 shadow-xl shadow-black/40">
          {conversation.kind !== "direct" && (
            <Link
              href={`/chat/${conversation.id}/members`}
              className="flex min-h-11 items-center rounded-xl px-3 text-sm text-text-1 transition-colors hover:bg-white/6 hover:text-text-0"
            >
              Участники · {conversation.membersCount}
            </Link>
          )}
          <MenuItem
            busy={busy}
            label={conversation.muted ? "Включить звук" : "Без звука"}
            onClick={() =>
              void run(async () => {
                const { muted } = await setChatMuted(
                  conversation.id,
                  !conversation.muted,
                );
                onChange({ muted });
              })
            }
          />
          <MenuItem
            busy={busy}
            label={conversation.pinned ? "Открепить" : "Закрепить"}
            onClick={() =>
              void run(async () => {
                const { pinned } = await setChatPinned(
                  conversation.id,
                  !conversation.pinned,
                );
                onChange({ pinned });
              })
            }
          />

          {isChannel && !isMember && (
            <MenuItem
              busy={busy}
              label="Подписаться"
              onClick={() =>
                void run(async () => {
                  await subscribeToChannel(conversation.id);
                  router.refresh();
                })
              }
            />
          )}

          <MenuItem
            busy={busy}
            label="Оформление"
            onClick={() => setAppearanceOpen(true)}
          />

          <MenuItem
            busy={busy}
            label="Пожаловаться"
            tone="warn"
            onClick={() =>
              void run(async () => {
                await reportChat({
                  reason: "Жалоба на беседу",
                  conversationId: conversation.id,
                });
              })
            }
          />

          <MenuItem
            busy={busy}
            label={
              conversation.kind === "direct"
                ? "Убрать из списка"
                : isChannel
                  ? "Отписаться"
                  : "Выйти из группы"
            }
            onClick={() =>
              void run(async () => {
                await leaveChatConversation(conversation.id);
                router.push("/chat");
              })
            }
          />

          {/* Удаление — только у владельца группы и канала: оно уносит
              переписку у всех участников, а не только у себя. Поэтому и
              подтверждение, и отдельный цвет. */}
          {conversation.kind !== "direct" &&
            conversation.myRole === "owner" && (
              <MenuItem
                busy={busy}
                tone="warn"
                label={isChannel ? "Удалить канал" : "Удалить группу"}
                onClick={() =>
                  void run(async () => {
                    const what = isChannel ? "канал" : "группу";
                    if (
                      !window.confirm(
                        `Удалить ${what} со всей перепиской? Её потеряют все участники, и вернуть будет нельзя.`,
                      )
                    )
                      return;
                    await deleteChatConversation(conversation.id);
                    router.push("/chat");
                  })
                }
              />
            )}
        </div>
      )}

      {appearanceOpen && (
        <div className="absolute right-0 top-12 z-10 flex w-64 flex-col gap-1 rounded-2xl border border-glass-brd bg-bg-1 p-1.5 shadow-xl shadow-black/40">
          <button
            type="button"
            onClick={() => void applyTheme(null)}
            className="flex min-h-11 items-center rounded-xl px-3 text-left text-sm text-text-1 transition-colors hover:bg-white/6 hover:text-text-0"
          >
            Без шаблона (по умолчанию)
          </button>
          {templates?.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => void applyTheme(template.id)}
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm text-text-1 transition-colors hover:bg-white/6 hover:text-text-0"
            >
              <span
                className="size-4 shrink-0 rounded-full border border-glass-brd"
                style={{ backgroundColor: template.bubbleMine }}
                aria-hidden
              />
              {template.name}
            </button>
          ))}
          <Link
            href="/chat/appearance"
            className="flex min-h-11 items-center rounded-xl px-3 text-sm text-cyan transition-colors hover:bg-white/6"
          >
            Создать новый шаблон
          </Link>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  busy,
  tone,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  tone?: "warn";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`flex min-h-11 items-center rounded-xl px-3 text-left text-sm transition-colors disabled:opacity-60 ${
        tone === "warn"
          ? "text-magenta hover:bg-magenta/10"
          : "text-text-1 hover:bg-white/6 hover:text-text-0"
      }`}
    >
      {label}
    </button>
  );
}
