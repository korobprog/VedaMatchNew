import type { ChatConversationKind, ChatGroupCallDto } from "@vedamatch/shared";
import type { GroupCallPhase } from "./group-call-state";
import { joinBlockedReason } from "./group-call-state";

/**
 * Когда в беседе вообще показывать кнопку группового звонка и что она
 * должна говорить.
 *
 * Чистым модулем по той же причине, что и остальное здесь: правил немного,
 * но каждое из них — «нельзя»: нельзя звонить в канале (там читатели, а не
 * собеседники), нельзя звонить в личном диалоге групповым звонком (для него
 * есть свой), нельзя начинать второй звонок, пока идёшь в первом.
 */

export function canStartGroupCall(conversation: {
  kind: ChatConversationKind;
  canWrite: boolean;
}): boolean {
  // Канал исключён: в нём сотни читателей и один автор — комната на четверых
  // там не имеет смысла, а кнопка «позвонить» рядом с постом вводит в
  // заблуждение. Личный диалог — свой звонок один на один.
  return conversation.kind === "group" && conversation.canWrite;
}

export interface GroupCallButtonLabel {
  text: string;
  disabled: boolean;
}

export function groupCallButtonLabel(
  ongoing: ChatGroupCallDto | null,
  phase: GroupCallPhase,
): GroupCallButtonLabel {
  if (phase === "joining") return { text: "Входим в звонок…", disabled: true };
  // Мы уже в каком-то звонке: второй одновременно вкладка не потянет, и
  // сервер бы его не дал — кнопка гаснет, возврат к своему звонку идёт
  // через плашку.
  if (phase === "active") return { text: "Вы уже в звонке", disabled: true };
  if (!ongoing) return { text: "Групповой звонок", disabled: false };
  const blocked = joinBlockedReason(ongoing);
  return blocked
    ? { text: blocked, disabled: true }
    : {
        text: `Присоединиться к звонку, ${ongoing.participants.length} в комнате`,
        disabled: false,
      };
}
