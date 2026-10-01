"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ChatMomentRing, ChatMomentsState } from "@vedamatch/shared";
import { subscribeToChat } from "@/lib/chat-stream";
import { ChatAvatar } from "../chat-avatar";
import { MomentRing } from "./moment-ring";
import { removeAuthor, sortRings, upsertRing } from "./moments";

const AVATAR = 54;

/**
 * Полоса моментов над списком бесед.
 *
 * Первая плитка — своя: она же кнопка «опубликовать», поэтому показывается
 * даже когда моментов нет ни у кого. Живая: событие потока добавляет кольцо
 * без перезагрузки списка.
 */
export function MomentsRail({ initial }: { initial: ChatMomentsState }) {
  const [rings, setRings] = useState(() => sortRings(initial.rings));

  useEffect(() => {
    return subscribeToChat((event) => {
      if (event.type === "moment.published")
        setRings((current) => upsertRing(current, event.ring));
      if (event.type === "moment.removed")
        setRings((current) => removeAuthor(current, event.authorId));
    });
  }, []);

  const mine = rings.find((ring) => ring.mine) ?? null;
  const others = rings.filter((ring) => !ring.mine);

  return (
    <nav aria-label="Моменты" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex items-start gap-3">
        <li>
          <MyTile ring={mine} />
        </li>
        {others.map((ring) => (
          <li key={ring.author.id}>
            <AuthorTile ring={ring} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Своя плитка: кольцо с моментами, если они есть, и плюс — если нет. */
function MyTile({ ring }: { ring: ChatMomentRing | null }) {
  if (!ring)
    return (
      <Link
        href="/chat/moments/new"
        className="flex w-[70px] flex-col items-center gap-1.5"
      >
        <span
          style={{ width: AVATAR + 8, height: AVATAR + 8 }}
          className="flex items-center justify-center rounded-full border border-dashed border-glass-brd bg-glass text-text-1"
        >
          <PlusIcon />
        </span>
        <span className="w-full truncate text-center text-[11px] text-text-1">
          Мой момент
        </span>
      </Link>
    );

  return (
    <Link
      href={`/chat/moments/${ring.author.id}`}
      className="flex w-[70px] flex-col items-center gap-1.5"
    >
      <MomentRing state={ring.unseen > 0 ? "unseen" : "seen"} size={AVATAR}>
        <Preview ring={ring} />
      </MomentRing>
      <span className="w-full truncate text-center text-[11px] text-text-1">
        Мой момент
      </span>
    </Link>
  );
}

function AuthorTile({ ring }: { ring: ChatMomentRing }) {
  const state = ring.unseen > 0 ? "unseen" : "seen";
  return (
    <Link
      href={`/chat/moments/${ring.author.id}`}
      // Кольцо декоративное, поэтому «новые моменты» проговариваются здесь:
      // иначе для скринридера все плитки одинаковы.
      aria-label={
        ring.unseen > 0
          ? `${ring.author.name}: новые моменты`
          : `${ring.author.name}: моменты просмотрены`
      }
      className="flex w-[70px] flex-col items-center gap-1.5"
    >
      <MomentRing state={state} size={AVATAR}>
        <Preview ring={ring} />
      </MomentRing>
      <span className="w-full truncate text-center text-[11px] text-text-1">
        {ring.author.name}
      </span>
    </Link>
  );
}

/** Миниатюра: последняя фотография, а без неё — аватар автора. */
function Preview({ ring }: { ring: ChatMomentRing }) {
  if (ring.previewUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ring.previewUrl}
        alt=""
        style={{ width: AVATAR, height: AVATAR }}
        className="rounded-full object-cover"
      />
    );
  return (
    <ChatAvatar
      kind="direct"
      user={ring.author}
      title={ring.author.name}
      size={AVATAR}
    />
  );
}

function PlusIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
