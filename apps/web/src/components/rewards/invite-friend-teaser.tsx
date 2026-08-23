"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import {
  readDismissals,
  serverDismissals,
  subscribeToDismissals,
  visibleCards,
  writeDismissal,
} from "@/lib/advisor/advisor-dismissals";

/**
 * Идентификатор для хранилища скрытий. Блок прячется тем же механизмом, что
 * и карточки советника под ним: он стоит с ними в одном ряду, и крестик на
 * соседях, работающий иначе, читался бы как поломка. Заодно не приходится
 * заводить второй такой же localStorage-ключ.
 *
 * Как и у советника, скрытие держится неделю, а не навсегда: закрыв блок в
 * первый день, человек больше никогда не узнал бы о приглашениях с главной.
 * Постоянные входы всё равно остаются — профиль и меню шапки.
 */
const CARD_ID = "rewards.invite";

/**
 * Блок «Пригласи друга» на главной, рядом с новостями. Небольшой намеренно:
 * он соседствует с сообщениями администрации и советником, и крупная
 * карточка тут спорила бы с тем, ради чего человек зашёл.
 *
 * Числа не показывает: они требуют запроса к сервису на каждой загрузке
 * главной, а зовёт этот блок на отдельный экран, где они и так есть.
 */
export function InviteFriendTeaser({ userId }: { userId: string }) {
  const getSnapshot = useCallback(() => readDismissals(userId), [userId]);
  const dismissals = useSyncExternalStore(
    subscribeToDismissals,
    getSnapshot,
    // На сервере хранилища нет: первый клиентский рендер обязан совпасть с
    // серверной разметкой, иначе гидратация падает.
    serverDismissals,
  );
  const shown = visibleCards([{ id: CARD_ID }], dismissals, new Date());
  if (shown.length === 0) return null;

  return (
    <section className="glass mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-glass-brd px-5 py-4">
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold text-text-0">
          Пригласи друга
        </h2>
        <p className="font-body text-sm text-text-1">
          За приглашённых начисляются баллы.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/rewards"
          className="btn-mint-outline rounded-xl px-4 py-2 font-body text-sm"
        >
          Получить ссылку
        </Link>
        <button
          type="button"
          onClick={() => writeDismissal(userId, CARD_ID)}
          aria-label="Скрыть на неделю"
          title="Скрыть на неделю"
          className="shrink-0 rounded-lg p-1 text-text-2 transition hover:bg-glass hover:text-text-0"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
    </section>
  );
}
