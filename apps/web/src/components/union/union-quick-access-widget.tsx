import type { UnionQuickAccessData } from "@/lib/union-quick-access";

export function UnionQuickAccessWidget({
  unreadMessages,
  incomingLikes,
  previewAvatars,
  moreCount,
  profileCompletionPercent,
}: UnionQuickAccessData) {
  const hasChips = unreadMessages > 0 || incomingLikes > 0;
  const hasAvatars = previewAvatars.length > 0;
  const hasProgress = profileCompletionPercent !== null;

  if (!hasChips && !hasAvatars && !hasProgress) return null;

  return (
    <div className="mb-4 space-y-2">
      {(hasChips || hasAvatars) && (
        <div className="flex flex-wrap items-center gap-2">
          {unreadMessages > 0 && (
            <span className="inline-flex items-center rounded-full bg-glass px-2.5 py-1 text-xs font-semibold text-text-1">
              💬 {unreadMessages}
            </span>
          )}
          {incomingLikes > 0 && (
            <span className="inline-flex items-center rounded-full bg-glass px-2.5 py-1 text-xs font-semibold text-text-1">
              ❤️ {incomingLikes}
            </span>
          )}
          {hasAvatars && (
            <div className="ml-auto flex items-center">
              {previewAvatars.map((avatar, index) => (
                <span
                  key={index}
                  className="-ml-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg-0 bg-glass text-[10px] font-semibold text-text-1 first:ml-0"
                  style={
                    avatar.url
                      ? {
                          backgroundImage: `url(${avatar.url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  {avatar.url ? null : avatar.initial}
                </span>
              ))}
              {moreCount > 0 && (
                <span className="ml-1.5 text-[11px] text-text-2">
                  +{moreCount}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {hasProgress && (
        <div
          role="progressbar"
          aria-label="Заполненность анкеты Union"
          aria-valuenow={profileCompletionPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 w-full overflow-hidden rounded-full bg-glass"
        >
          <div
            className="h-full rounded-full bg-cyan"
            style={{ width: `${profileCompletionPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
