import type { UnionQuickAccessData } from "@/lib/union-quick-access";
import { CompletenessIcon } from "./completeness-icons";
import { unionProfileFieldLabels } from "./dictionaries";

export function UnionQuickAccessWidget({
  unreadMessages,
  incomingLikes,
  previewAvatars,
  moreCount,
  profileCompletionPercent,
  profileItems,
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
        <div className="flex items-center gap-2">
          <div
            role="progressbar"
            aria-label="Заполненность анкеты Union"
            aria-valuenow={profileCompletionPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-glass"
          >
            {/* Приглушённая и «созревающая»: у пустой анкеты полоса золотая, по
                мере заполнения зеленеет. Яркая мятная на всю ширину карточки
                спорила с самой карточкой за внимание. Оба цвета — токены,
                определённые в обеих темах. */}
            <div
              className="h-full rounded-full opacity-70"
              style={{
                width: `${profileCompletionPercent}%`,
                background: `color-mix(in oklab, var(--vm-gold), var(--vm-cyan) ${profileCompletionPercent}%)`,
              }}
            />
          </div>
          {/* Кнопка «?» — <details>, а не состояние: работает без JavaScript
              и сама закрывается по Escape в браузерах, где это поддержано.
              Текст называет последствие, а не просит «заполнить профиль». */}
          <details className="relative shrink-0">
            <summary
              aria-label="Зачем заполнять анкету"
              className="flex size-5 cursor-pointer list-none items-center justify-center rounded-full border border-glass-brd text-[11px] font-bold text-text-2 hover:text-text-0 [&::-webkit-details-marker]:hidden"
            >
              ?
            </summary>
            <p className="glass absolute right-0 top-7 z-10 w-64 rounded-xl border border-glass-brd p-3 text-xs leading-relaxed text-text-1">
              Чем больше вы расскажете о себе, тем выше анкета в
              рекомендациях и тем чаще вас видят. Ниже — что уже заполнено, а
              что ещё нет.
            </p>
          </details>
        </div>
      )}
      {hasProgress && profileItems.length > 0 && (
        /* Что именно заполнено, а что нет — значками под полосой. Процент
           сам по себе не говорит, за что взяться; ряд значков говорит:
           заполненное — ярче, пустое — бледный контур. Название поля и
           состояние — в подписи для наведения и для скринридера. */
        <ul
          aria-label="Поля анкеты"
          className="flex flex-wrap gap-1.5"
        >
          {profileItems.map((item) => {
            const label = unionProfileFieldLabels[item.key];
            return (
              <li
                key={item.key}
                title={`${label}: ${item.filled ? "заполнено" : "не заполнено"}`}
                className={
                  item.filled
                    ? "text-cyan"
                    : "text-text-2 opacity-40"
                }
              >
                <CompletenessIcon field={item.key} className="size-4" />
                <span className="sr-only">
                  {label}: {item.filled ? "заполнено" : "не заполнено"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
