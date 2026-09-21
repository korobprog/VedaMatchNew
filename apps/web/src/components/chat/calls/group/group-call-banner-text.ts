import type { ChatGroupCallDto } from "@vedamatch/shared";
import { plural } from "@/lib/plural";
import { joinBlockedReason } from "./group-call-state";

/**
 * Что написать на плашке группового звонка и что она делает по нажатию.
 *
 * Два состояния на одной плашке, и приоритет между ними — не мелочь:
 * если человек УЖЕ в звонке, плашка обязана вести назад к своему экрану, а
 * не предлагать «присоединиться» к тому же звонку. Чистая функция потому,
 * что это ровно та развилка, которую легко сломать правкой в JSX и невозможно
 * заметить глазом: оба варианта выглядят как одинаковая строка.
 */

export interface GroupCallBannerText {
  kind: "own" | "invite";
  callId: string;
  title: string;
  action: string;
  /**
   * Нажатие ничего не даст: комната полна или звонок уже кончился. Флагом,
   * а не сравнением подписи с «Войти» в разметке — подпись меняется, а
   * погасшая кнопка не должна зависеть от того, как её назвали.
   */
  blocked: boolean;
}

export function groupCallBannerLabel(
  /** Звонок, в котором мы прямо сейчас (панель свёрнута). */
  own: ChatGroupCallDto | null,
  /** Звонок, идущий в открытой беседе. */
  inConversation: ChatGroupCallDto | null,
  selfId: string,
): GroupCallBannerText | null {
  if (own)
    return {
      kind: "own",
      callId: own.id,
      title: `Групповой звонок · ${peopleLabel(own.participants.length)}`,
      action: "Вернуться",
      blocked: false,
    };

  if (!inConversation || inConversation.status !== "live") return null;
  // Мы в составе этой комнаты, но панели нет — вкладка перезагружается или
  // медиа ещё поднимается. Предлагать «войти» в звонок, где мы уже
  // числимся, незачем: подождём, пока провайдер доведёт вход.
  if (inConversation.participants.some((p) => p.user.id === selfId))
    return null;

  const blocked = joinBlockedReason(inConversation);
  return {
    kind: "invite",
    callId: inConversation.id,
    title: `Идёт звонок · ${peopleLabel(inConversation.participants.length)}`,
    action: blocked ?? "Войти",
    blocked: blocked !== null,
  };
}

/** «3 человека», «1 человек» — без «участников», плашка узкая. */
export function peopleLabel(count: number): string {
  return `${count} ${plural(count, "человек", "человека", "человек")}`;
}
