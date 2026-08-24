"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ChatChannelCommunity,
  ChatUserSummary,
} from "@vedamatch/shared";
import { createChatConversation } from "@/lib/chat-client";
import { ChatAvatar } from "./chat-avatar";

type Mode = "group" | "channel";

/**
 * Новая беседа: группа или канал общины.
 *
 * Участники группы выбираются из тех, с кем уже есть личный диалог: собрать
 * беседу из незнакомых людей — это тот же спам, только приглашением вместо
 * сообщения. Канал заводится в общине, где человек владелец или
 * администратор; у кого таких общин нет, тот и вкладки не увидит.
 */
export function ChatNewConversation({
  people,
  communities,
}: {
  people: ChatUserSummary[];
  communities: ChatChannelCommunity[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("group");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [communityId, setCommunityId] = useState(
    communities[0]?.community.id ?? "",
  );
  const [groupCommunityId, setGroupCommunityId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function create() {
    const name = title.trim();
    if (!name) {
      setError(
        mode === "group"
          ? "У группы должно быть название"
          : "У канала должно быть название",
      );
      return;
    }
    if (mode === "channel" && !communityId) {
      setError("Выберите общину");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const conversation = await createChatConversation(
        mode === "group"
          ? {
              kind: "group",
              title: name,
              memberIds: selected,
              communityId: groupCommunityId || undefined,
            }
          : {
              kind: "channel",
              title: name,
              description: description.trim() || undefined,
              communityId,
            },
      );
      router.push(`/chat/${conversation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Беседа не создалась");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-sm text-cyan">
          {error}
        </p>
      )}

      {communities.length > 0 && (
        <div
          role="tablist"
          aria-label="Вид беседы"
          className="flex rounded-2xl border border-glass-brd bg-white/5 p-0.5"
        >
          {(
            [
              ["group", "Группа"],
              ["channel", "Канал общины"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`h-10 flex-1 rounded-xl text-sm transition-colors ${
                mode === value
                  ? "border border-glass-brd bg-glass font-bold text-text-0"
                  : "font-medium text-text-1 hover:text-text-0"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-xs font-medium text-text-1">Название</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={
            mode === "group"
              ? "Например: Киртан-группа · Москва"
              : "Например: Объявления общины"
          }
          maxLength={80}
          className="min-h-11 rounded-2xl border border-glass-brd bg-glass px-3.5 text-[15px] text-text-0 outline-none placeholder:text-text-2"
        />
      </label>

      {mode === "group" ? (
        <div className="flex flex-col gap-2">
          {communities.length > 0 && (
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-text-1">Община</span>
              <select
                value={groupCommunityId}
                onChange={(event) => setGroupCommunityId(event.target.value)}
                className="min-h-11 rounded-2xl border border-glass-brd bg-glass px-3 text-[15px] text-text-0 outline-none"
              >
                <option value="">Личная группа (без общины)</option>
                {communities.map(({ community }) => (
                  <option key={community.id} value={community.id}>
                    {community.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <span className="text-xs font-medium text-text-1">
            Кого позвать{" "}
            <span className="text-text-2">(можно и позже, из меню беседы)</span>
          </span>

          {people.length === 0 ? (
            <p className="rounded-2xl border border-glass-brd bg-glass p-6 text-center text-sm text-text-1">
              Пока некого звать: группа собирается из тех, с кем уже есть личная
              переписка.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {people.map((person) => {
                const checked = selected.includes(person.id);
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => toggle(person.id)}
                      aria-pressed={checked}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors ${
                        checked
                          ? "border-cyan/34 bg-cyan/10"
                          : "border-transparent hover:bg-white/5"
                      }`}
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
                      <span
                        className={`flex size-6 items-center justify-center rounded-lg border ${
                          checked
                            ? "border-cyan bg-cyan text-bg-0"
                            : "border-glass-brd text-transparent"
                        }`}
                        aria-hidden
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 12.5l5 5L20 7" />
                        </svg>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-text-1">Община</span>
            <select
              value={communityId}
              onChange={(event) => setCommunityId(event.target.value)}
              className="min-h-11 rounded-2xl border border-glass-brd bg-glass px-3 text-[15px] text-text-0 outline-none"
            >
              {communities.map(({ community }) => (
                <option key={community.id} value={community.id}>
                  {community.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-text-1">
              О чём канал{" "}
              <span className="text-text-2">(необязательно)</span>
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Официальные новости храма"
              className="resize-none rounded-2xl border border-glass-brd bg-glass px-3.5 py-3 text-[15px] text-text-0 outline-none placeholder:text-text-2"
            />
          </label>

          <ExistingChannels
            channels={
              communities.find((row) => row.community.id === communityId)
                ?.channels ?? []
            }
          />

          <p className="rounded-2xl border border-glass-brd bg-white/4 px-3.5 py-3 text-xs leading-[17px] text-text-1">
            В канал пишет только администрация общины. Остальные читают, ставят
            реакции и подписываются.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void create()}
        disabled={busy}
        className="flex min-h-12 items-center justify-center rounded-2xl border border-mint-edge bg-mint text-[15px] font-bold text-on-mint disabled:opacity-60"
      >
        {busy
          ? "Создаю…"
          : mode === "group"
            ? "Создать группу"
            : "Создать канал"}
      </button>
    </div>
  );
}

/**
 * Уже заведённые каналы общины. Не запрет, а напоминание: второй канал у
 * одной общины обычно заводят по забывчивости, а подписчики расходятся
 * между ними и перестают видеть половину новостей.
 */
function ExistingChannels({
  channels,
}: {
  channels: { id: string; title: string }[];
}) {
  if (channels.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-gold/26 bg-gold/8 p-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-gold">
        У общины уже есть канал
      </span>
      <ul className="flex flex-col gap-1">
        {channels.map((channel) => (
          <li key={channel.id}>
            <Link
              href={`/chat/${channel.id}`}
              className="text-sm font-semibold text-text-0 hover:text-cyan"
            >
              {channel.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
