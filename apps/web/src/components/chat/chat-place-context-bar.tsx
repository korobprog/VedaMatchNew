import Link from "next/link";
import type { ChatTravelMapContext } from "@vedamatch/shared";
import {
  placeContextHref,
  placeContextLabel,
  placeContextTitle,
} from "./chat-place-context";

/** Шапка группы места или набора: название ведёт на карточку в «Путешествиях». */
export function ChatPlaceContextBar({
  context,
}: {
  context: ChatTravelMapContext;
}) {
  const label = placeContextLabel(context);
  return (
    <div className="flex items-center gap-2.5 border-b border-glass-brd bg-cyan/6 px-1 py-2">
      <span aria-hidden className="shrink-0 text-base">
        📍
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-1">
          {placeContextTitle(context)}
        </span>
        <Link
          href={placeContextHref(context)}
          className="truncate text-xs text-text-0 underline"
        >
          {context.title}
        </Link>
        {label && <span className="truncate text-xs text-text-1">{label}</span>}
      </span>
    </div>
  );
}
