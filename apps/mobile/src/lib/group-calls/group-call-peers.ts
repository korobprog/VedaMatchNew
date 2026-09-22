import type { ChatGroupCallDto, ChatGroupCallParticipantDto } from '@vedamatch/shared';

/**
 * Кто с кем соединяется в mesh'е — решение на стороне телефона.
 *
 * Правило то же, что у сервера (`apps/api/.../group/group-call-room.ts`),
 * и продублировано намеренно: клиент обязан уметь пересчитать план
 * соединений из состава комнаты, который он и так получает событием, не
 * спрашивая сервер отдельным запросом. Сервер тем же правилом пользуется
 * только для проверок; расходиться им нельзя, поэтому оба покрыты тестом,
 * в котором пара «кто кому шлёт offer» проверяется на симметрию.
 *
 * Суть: позже вошедший делает offer всем, кто уже был. Без такого правила
 * обе стороны пары выставляют offer одновременно (glare), и соединение не
 * поднимается вовсе — жёсткие роли caller/callee звонка один на один здесь
 * не годятся, «звонивший» один, а пар до шести.
 */

export interface PeerPlan {
  /** С кем держим соединение (все, кроме себя). */
  peers: string[];
  /** Кому МЫ шлём offer; остальным — ждём offer от них. */
  offerTo: string[];
  /** Кого больше нет в комнате — эти соединения пора закрыть. */
  gone: string[];
  /** Кто появился с прошлого пересчёта. */
  added: string[];
}

/** Порядок участников, как его задаёт сервер: по времени входа. */
function orderedIds(participants: readonly ChatGroupCallParticipantDto[]): string[] {
  return [...participants]
    .sort((a, b) => {
      const byTime = Date.parse(a.joinedAt) - Date.parse(b.joinedAt);
      return byTime !== 0 ? byTime : a.user.id.localeCompare(b.user.id);
    })
    .map((p) => p.user.id);
}

/**
 * План соединений: кого поднять, кому слать offer, кого закрыть.
 *
 * `current` — с кем соединение уже есть (ключи карты `PeerLink` в
 * провайдере). Функция не знает ни про WebRTC, ни про сеть — её задача
 * ответить на вопрос «что изменилось».
 */
export function planPeers(
  call: Pick<ChatGroupCallDto, 'participants'>,
  selfId: string,
  current: readonly string[] = [],
): PeerPlan {
  const ordered = orderedIds(call.participants);
  const selfIndex = ordered.indexOf(selfId);
  if (selfIndex < 0)
    // Нас в комнате нет: держать соединения не с кем, все прежние — на закрытие.
    return { peers: [], offerTo: [], gone: [...current], added: [] };

  const peers = ordered.filter((id) => id !== selfId);
  const offerTo = ordered.slice(0, selfIndex);
  return {
    peers,
    offerTo,
    gone: current.filter((id) => !peers.includes(id)),
    added: peers.filter((id) => !current.includes(id)),
  };
}

/** Сколько соединений держит телефон при таком составе. */
export function ownConnectionCount(participantCount: number): number {
  return Math.max(participantCount - 1, 0);
}

/** Участник по id — для подписей на экране. */
export function participantOf(
  call: Pick<ChatGroupCallDto, 'participants'>,
  userId: string,
): ChatGroupCallParticipantDto | null {
  return call.participants.find((p) => p.user.id === userId) ?? null;
}
