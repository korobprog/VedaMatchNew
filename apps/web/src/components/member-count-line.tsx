"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { MemberCounter } from "@/components/member-counter";
import { statsCallToAction } from "@/lib/stats-call-to-action";
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
 *
 * Строка — ссылка: за ней статистика портала и способ поддержать проект,
 * иначе число ничего не предлагает сделать.
 */
export function MemberCountLine({
  userId,
  total,
  greetName,
}: {
  userId: string;
  total: number;
  /**
   * Имя для обращения. Приходит, только когда советник молчит: здоровается
   * кто-то один, иначе имя звучит дважды на одном экране.
   */
  greetName?: string;
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
      <Link
        href="/stats"
        className="group inline-block transition-colors hover:text-text-1"
      >
        Вместе нас:{" "}
        <MemberCounter total={total} className="font-semibold text-text-0" />
        <span className="block text-xs underline underline-offset-2 group-hover:text-text-0">
          {statsCallToAction(greetName)}
        </span>
      </Link>
    </p>
  );
}
