"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MemberCounter } from "@/components/member-counter";
import {
  effectiveMode,
  readLayout,
  serverLayout,
  subscribeToLayout,
} from "@/lib/service-layout";

/**
 * Строка «Вместе нас: N» над сеткой сервисов.
 *
 * В компактном режиме её нет. Это приятная цифра, но не повод для действия
 * — а компактный режим существует ровно затем, чтобы над сеткой осталось
 * только то, что требует внимания. Кто захочет посмотреть, переключится
 * в подробный, где строка на месте.
 *
 * Отдельный компонент, а не условие в `page.tsx`: режим лежит в localStorage
 * и на сервере неизвестен, так что решать может только клиент.
 */
export function MemberCountLine({
  userId,
  total,
}: {
  userId: string;
  total: number;
}) {
  const getLayout = useCallback(() => readLayout(userId), [userId]);
  const layout = useSyncExternalStore(
    subscribeToLayout,
    getLayout,
    serverLayout,
  );

  if (effectiveMode(layout) === "compact") return null;

  return (
    <p className="mb-8 text-sm text-text-2">
      Вместе нас:{" "}
      <MemberCounter total={total} className="font-semibold text-text-0" />
    </p>
  );
}
