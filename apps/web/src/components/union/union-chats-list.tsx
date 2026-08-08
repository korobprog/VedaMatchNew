import Link from "next/link";
import type { UnionChatsState } from "@vedamatch/shared";
import { VerifiedBadge } from "./verified-badge";

/** Список диалогов: последнее сообщение и счётчик непрочитанного. */
export function UnionChatsList({
  state,
  loadError,
}: {
  state: UnionChatsState | null;
  loadError?: string | null;
}) {
  if (!state) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        {loadError ?? "Не удалось загрузить чаты. Обновите страницу."}
      </div>
    );
  }

  if (state.chats.length === 0) {
    return (
      <div className="glass rounded-3xl border border-glass-brd p-10 text-center text-sm text-text-1">
        Чатов пока нет. Как только знакомство станет взаимным, здесь появится
        диалог.
      </div>
    );
  }

  return (
    <ul className="glass divide-y divide-glass-brd overflow-hidden rounded-3xl border border-glass-brd">
      {state.chats.map((chat) => {
        const photo = chat.user.photos[0]?.url ?? chat.user.avatarUrl;
        const preview = chat.lastMessage
          ? `${chat.lastMessageMine ? "Вы: " : ""}${chat.lastMessage}`
          : "Напишите первым";
        return (
          <li key={chat.requestId}>
            <Link
              href={`/union/chats/${chat.requestId}`}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-glass"
            >
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-bg-2">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt={chat.user.name}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-magenta/25 to-[#B23EFF]/25 font-display text-lg font-bold text-text-0">
                    {chat.user.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium text-text-0">
                    {chat.user.name}
                  </span>
                  {chat.user.isVerifiedDevotee && <VerifiedBadge />}
                </span>
                <span
                  className={`block truncate text-sm ${
                    chat.unreadCount > 0 ? "text-text-0" : "text-text-2"
                  }`}
                >
                  {preview}
                </span>
              </span>
              {chat.unreadCount > 0 && (
                <span
                  aria-label={`Непрочитанных сообщений: ${chat.unreadCount}`}
                  className="min-w-[22px] shrink-0 rounded-full bg-magenta px-1.5 text-center text-xs font-semibold leading-[22px] text-white"
                >
                  {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
