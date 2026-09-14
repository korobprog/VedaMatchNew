"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { contactTravelStay } from "@/lib/travel-api";

/**
 * «Написать хозяину»: открывает личную переписку в «Общении» с карточкой
 * объекта и, если вопрос по заявке, её датами. Сама переписка — в чате
 * портала, у «Путешествий» своего нет.
 */
export function ContactHostButton({
  stayId,
  bookingId = null,
  className = "rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 disabled:opacity-60",
}: {
  stayId: string;
  bookingId?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setPending(true);
    setError(null);
    try {
      const { conversationId } = await contactTravelStay(stayId, { bookingId });
      router.push(
        conversationId
          ? `/chat/${encodeURIComponent(conversationId)}`
          : "/chat",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Переписка не открылась",
      );
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void open()}
        disabled={pending}
        className={className}
      >
        {pending ? "Открываем переписку…" : "Написать хозяину"}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-magenta">
          {error}
        </span>
      ) : null}
    </span>
  );
}
