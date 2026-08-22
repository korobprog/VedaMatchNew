"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ChatConversationDetail,
  ChatMemberDto,
  ChatUserSummary,
} from "@vedamatch/shared";
import {
  addChatMembers,
  removeChatMember,
  setChatMemberRole,
  updateChatConversation,
  uploadChatFile,
} from "@/lib/chat-client";
import { ChatAvatar } from "./chat-avatar";

const ROLE_LABEL: Record<string, string> = {
  owner: "Владелец",
  admin: "Администратор",
  member: "Участник",
};

/**
 * Участники группы или канала: кто состоит, кто чем управляет, кого позвать.
 *
 * Права повторяют серверные (chat-access.ts): администратор убирает
 * участников, роли раздаёт только владелец, владельца не трогает никто.
 * Кнопка не должна предлагать то, что API откажется делать.
 */
export function ChatMembersView({
  conversation,
  candidates,
  viewerId,
}: {
  conversation: ChatConversationDetail;
  /** Кого можно позвать: собеседники личных диалогов, ещё не в беседе. */
  candidates: ChatUserSummary[];
  viewerId: string;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(conversation.members);
  const [title, setTitle] = useState(conversation.title);
  const [description, setDescription] = useState(
    conversation.description ?? "",
  );
  const [avatarUrl, setAvatarUrl] = useState(conversation.avatarUrl ?? null);
  const [visibility, setVisibility] = useState(conversation.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const avatarInput = useRef<HTMLInputElement | null>(null);

  const myRole = conversation.myRole;
  const isOwner = myRole === "owner";
  const canManage = isOwner || myRole === "admin";

  const outside = candidates.filter(
    (person) => !members.some((member) => member.user.id === person.id),
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-sm text-cyan">
          {error}
        </p>
      )}

      {canManage && (
        <section className="flex flex-col gap-3 rounded-2xl border border-glass-brd bg-glass p-3.5">
          <h2 className="text-sm font-semibold text-text-0">
            {conversation.kind === "channel" ? "О канале" : "О группе"}
          </h2>

          <div className="flex items-center gap-3">
            <ChatAvatar
              kind={conversation.kind}
              title={title}
              size={56}
              imageUrl={avatarUrl}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => avatarInput.current?.click()}
              className="min-h-11 rounded-xl border border-glass-brd px-3.5 text-[13px] font-semibold text-text-1 hover:text-text-0 disabled:opacity-60"
            >
              {avatarUrl ? "Заменить картинку" : "Загрузить картинку"}
            </button>
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void run(async () => {
                  // Картинка едет в то же хранилище, что и вложения беседы:
                  // отдельного пути для аватара заводить незачем.
                  const stored = await uploadChatFile(conversation.id, file);
                  await updateChatConversation(conversation.id, {
                    avatarUrl: stored.url,
                    avatarKey: stored.key,
                  });
                  setAvatarUrl(stored.url);
                  router.refresh();
                });
              }}
            />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-text-1">Название</span>
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setSaved(false);
              }}
              maxLength={80}
              className="min-h-11 rounded-xl border border-glass-brd bg-white/5 px-3 text-[15px] text-text-0 outline-none"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-1">Кто может войти</span>
            <div className="flex rounded-xl border border-glass-brd bg-white/5 p-0.5">
              {(
                [
                  ["private", "По приглашению"],
                  ["public", "Открыто для всех"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={visibility === value}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await updateChatConversation(conversation.id, {
                        visibility: value,
                      });
                      setVisibility(value);
                      router.refresh();
                    })
                  }
                  className={`h-10 flex-1 rounded-lg text-[13px] transition-colors disabled:opacity-60 ${
                    visibility === value
                      ? "border border-glass-brd bg-glass font-bold text-text-0"
                      : "font-medium text-text-1 hover:text-text-0"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[11px] leading-4 text-text-2">
              {visibility === "public"
                ? "Беседа видна в каталоге открытых, войти может любой участник портала."
                : "Беседа не показывается в каталоге, войти можно только по приглашению."}
            </span>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-text-1">Описание</span>
            <textarea
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setSaved(false);
              }}
              rows={2}
              maxLength={300}
              className="resize-none rounded-xl border border-glass-brd bg-white/5 px-3 py-2.5 text-[15px] text-text-0 outline-none"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await updateChatConversation(conversation.id, {
                  title,
                  description,
                });
                setSaved(true);
                router.refresh();
              })
            }
            className="min-h-11 self-start rounded-xl border border-mint-edge bg-mint px-4 text-sm font-bold text-on-mint disabled:opacity-60"
          >
            {saved ? "Сохранено" : "Сохранить"}
          </button>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-text-0">
          Участники · {members.length}
        </h2>
        <ul className="flex flex-col gap-1">
          {members.map((member) => (
            <MemberRow
              key={member.user.id}
              member={member}
              isMe={member.user.id === viewerId}
              canRemove={
                canManage &&
                member.role !== "owner" &&
                member.user.id !== viewerId &&
                (isOwner || member.role === "member")
              }
              canSetRole={isOwner && member.role !== "owner"}
              busy={busy}
              onRemove={() =>
                void run(async () => {
                  await removeChatMember(conversation.id, member.user.id);
                  setMembers((current) =>
                    current.filter((row) => row.user.id !== member.user.id),
                  );
                })
              }
              onToggleRole={() =>
                void run(async () => {
                  const next = member.role === "admin" ? "member" : "admin";
                  await setChatMemberRole(
                    conversation.id,
                    member.user.id,
                    next,
                  );
                  setMembers((current) =>
                    current.map((row) =>
                      row.user.id === member.user.id
                        ? { ...row, role: next }
                        : row,
                    ),
                  );
                })
              }
            />
          ))}
        </ul>
      </section>

      {canManage && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-0">Позвать</h2>
          {outside.length === 0 ? (
            <p className="rounded-2xl border border-glass-brd bg-glass p-6 text-center text-sm text-text-1">
              Звать некого: приглашаются те, с кем уже есть личная переписка.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {outside.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await addChatMembers(conversation.id, [person.id]);
                        setMembers((current) => [
                          ...current,
                          {
                            user: person,
                            role: "member",
                            joinedAt: new Date().toISOString(),
                            lastReadAt: null,
                          },
                        ]);
                      })
                    }
                    className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
                  >
                    <ChatAvatar
                      kind="direct"
                      user={person}
                      title={person.name}
                      size={44}
                    />
                    <span className="flex-1 text-[15px] font-semibold text-text-0">
                      {person.name}
                    </span>
                    <span className="text-[13px] font-semibold text-cyan">
                      Позвать
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function MemberRow({
  member,
  isMe,
  canRemove,
  canSetRole,
  busy,
  onRemove,
  onToggleRole,
}: {
  member: ChatMemberDto;
  isMe: boolean;
  canRemove: boolean;
  canSetRole: boolean;
  busy: boolean;
  onRemove: () => void;
  onToggleRole: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl p-2.5">
      <ChatAvatar
        kind="direct"
        user={member.user}
        title={member.user.name}
        size={44}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold text-text-0">
          {member.user.name}
          {isMe && <span className="text-text-2"> · вы</span>}
        </span>
        <span
          className={`text-xs ${
            member.role === "owner"
              ? "text-gold"
              : member.role === "admin"
                ? "text-cyan"
                : "text-text-2"
          }`}
        >
          {ROLE_LABEL[member.role] ?? member.role}
        </span>
      </span>

      {canSetRole && (
        <button
          type="button"
          onClick={onToggleRole}
          disabled={busy}
          className="min-h-11 rounded-xl border border-glass-brd px-3 text-xs font-semibold text-text-1 hover:text-text-0 disabled:opacity-60"
        >
          {member.role === "admin" ? "Снять права" : "Сделать админом"}
        </button>
      )}

      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`Убрать ${member.user.name}`}
          className="flex size-11 items-center justify-center rounded-xl border border-magenta/26 text-magenta disabled:opacity-60"
        >
          ✕
        </button>
      )}
    </li>
  );
}
