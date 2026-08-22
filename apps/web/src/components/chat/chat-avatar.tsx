import type { ChatConversationKind, ChatUserSummary } from "@vedamatch/shared";
import { authorPalette } from "./chat-author-color";

/**
 * Знак беседы: фото собеседника, а без фото — буква на цветной подложке.
 * Цвет подложки свой у каждого человека и совпадает с цветом его имени в
 * группе: в списке из тридцати строк и в беседе на два десятка человек
 * одинаковые кружки не помогают отличить одного от другого.
 *
 * Группа и канал получают не букву, а свой значок: вид беседы должен
 * читаться раньше названия.
 */
export function ChatAvatar({
  kind,
  user,
  title,
  size = 50,
  online,
  imageUrl,
}: {
  kind: ChatConversationKind;
  user?: ChatUserSummary | null;
  title: string;
  size?: number;
  online?: boolean;
  /** Картинка группы или канала, если её загрузили. */
  imageUrl?: string | null;
}) {
  const box = { width: size, height: size };

  if (kind !== "direct" && imageUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        style={box}
        className="shrink-0 rounded-2xl object-cover"
      />
    );

  if (kind !== "direct") {
    const tint =
      kind === "channel"
        ? "bg-gold/12 border-gold/34 text-gold"
        : "bg-cyan/12 border-cyan/34 text-cyan";
    return (
      <span
        style={box}
        className={`flex shrink-0 items-center justify-center rounded-2xl border ${tint}`}
        aria-hidden
      >
        {kind === "channel" ? <ChannelIcon /> : <GroupIcon />}
      </span>
    );
  }

  const letter = (user?.name ?? title).trim().charAt(0).toUpperCase() || "?";
  const { avatar } = authorPalette(user?.id ?? title);

  return (
    <span className="relative shrink-0" style={box}>
      {user?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
          alt=""
          style={box}
          className="rounded-full object-cover"
        />
      ) : (
        <span
          style={{
            ...box,
            background: `linear-gradient(135deg, ${avatar.from} 0%, ${avatar.to} 100%)`,
            color: avatar.ink,
            fontSize: Math.round(size * 0.36),
          }}
          className="flex items-center justify-center rounded-full font-display font-semibold"
          aria-hidden
        >
          {letter}
        </span>
      )}
      {online && (
        <span
          aria-label="в сети"
          className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-bg-0 bg-cyan"
        />
      )}
    </span>
  );
}

function GroupIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19a5.8 5.8 0 0111 0" />
      <circle cx="17" cy="10" r="2.6" />
      <path d="M15.4 15.6a5 5 0 015.1 3.4" />
    </svg>
  );
}

function ChannelIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 10v4a1 1 0 001 1h2l6 4V5L7 9H5a1 1 0 00-1 1z" />
      <path d="M17 9.5a4 4 0 010 5" />
    </svg>
  );
}
