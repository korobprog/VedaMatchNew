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

  /* Число и приглашение посмотреть статистику — одной строкой (VED-433):
     двумя строками они занимали над сеткой место под целую кнопку. Если
     обращение по имени длинное и строка не помещается, приглашение
     переносится целиком, а не рвётся посередине. */
  return (
    <p className="mb-8 text-sm text-text-2">
      <Link
        href="/stats"
        className="group inline-flex flex-wrap items-baseline gap-x-2 transition-colors hover:text-text-1"
      >
        <span className="whitespace-nowrap">
          Вместе нас:{" "}
          <MemberCounter total={total} className="font-semibold text-text-0" />
        </span>
        <span className="text-xs underline underline-offset-2 group-hover:text-text-0">
          {statsCallToAction(greetName)}
        </span>
      </Link>
    </p>
  );
}
