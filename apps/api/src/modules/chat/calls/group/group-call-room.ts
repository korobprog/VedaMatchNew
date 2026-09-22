import { CHAT_GROUP_CALL_MAX_PARTICIPANTS } from '@vedamatch/shared';

/**
 * Правила комнаты группового звонка — чистым модулем, без Prisma и Redis.
 *
 * Сервис (`chat-group-calls.service.ts`) только применяет решения отсюда:
 * кого пускать, кто «хозяин», кто уже мёртв и пора ли закрывать комнату.
 * Ошибка в этих правилах — это либо пятый участник, от которого телефон
 * захлёбывается, либо комната, которую невозможно закрыть, либо хозяин,
 * которого не существует. Держать их вперемешку с запросами к базе нельзя:
 * их надо проверять таблицей случаев, а не поднятым Postgres.
 *
 * Модель mesh'а (решение от 2026-09-21, вариант 1): каждый участник держит
 * соединение с каждым. Сервер тут — только сигналинг и состав.
 */

export const GROUP_CALL_MAX_PARTICIPANTS = CHAT_GROUP_CALL_MAX_PARTICIPANTS;

/**
 * Сколько ждём от участника подтверждения жизни. Телефон шлёт heartbeat
 * раз в `GROUP_CALL_HEARTBEAT_MS`; протухшим считаем после трёх пропущенных —
 * короткая просадка сети (лифт, переключение Wi-Fi → LTE) не должна
 * выкидывать человека из разговора, а уехавший в тоннель не должен висеть
 * в списке до конца звонка.
 */
export const GROUP_CALL_HEARTBEAT_MS = 15_000;
export const GROUP_CALL_PARTICIPANT_TTL_MS = 3 * GROUP_CALL_HEARTBEAT_MS;

/**
 * Сколько живёт комната, в которой никого не осталось, прежде чем её
 * закроет уборщик. Ноль: пустая комната закрывается тем же действием,
 * которое опустошило её, — отдельной «льготы» нет, войти в комнату,
 * где никого нет, всё равно что начать новую.
 */
export interface RoomParticipant {
  userId: string;
  /** ms, `Date.getTime()`. Определяет и порядок в списке, и хозяина. */
  joinedAt: number;
  /** ms последнего heartbeat. */
  lastSeenAt: number;
  muted: boolean;
}

/** Причина отказа во входе. */
export type JoinDenial =
  /** В комнате уже `GROUP_CALL_MAX_PARTICIPANTS` живых. */
  | 'full'
  /** Комната уже закрыта. */
  | 'ended';

export type JoinDecision =
  /** Новый участник. */
  | { kind: 'join' }
  /** Он уже в комнате: повторный `join` с другого экрана — не ошибка. */
  | { kind: 'rejoin' }
  | { kind: 'deny'; reason: JoinDenial };

/** Жив ли участник на момент `now`. */
export function isAlive(p: RoomParticipant, now: number): boolean {
  return now - p.lastSeenAt <= GROUP_CALL_PARTICIPANT_TTL_MS;
}

/**
 * Живые участники по возрастанию `joinedAt`. Одинаковое время входа (две
 * записи в одной миллисекунде — на быстрой машине это реально) разводится
 * по `userId`, иначе порядок, а с ним и хозяин, зависели бы от того, в
 * каком порядке база вернула строки.
 */
export function liveParticipants(
  participants: readonly RoomParticipant[],
  now: number,
): RoomParticipant[] {
  return participants
    .filter((p) => isAlive(p, now))
    .sort((a, b) =>
      a.joinedAt === b.joinedAt
        ? a.userId.localeCompare(b.userId)
        : a.joinedAt - b.joinedAt,
    );
}

/** Кого пора убрать из комнаты: перестал подтверждать присутствие. */
export function staleParticipants(
  participants: readonly RoomParticipant[],
  now: number,
): RoomParticipant[] {
  return participants.filter((p) => !isAlive(p, now));
}

/**
 * Хозяин комнаты — самый ранний из ЖИВЫХ участников, а не тот, кто её
 * открыл. Так вопрос «что будет, если хозяин выйдет» решается сам:
 * роль переходит следующему по времени входа, комната продолжает жить.
 * `null` — живых не осталось, комнату пора закрывать.
 *
 * Хозяин в этом этапе не имеет особых прав (выгнать, закрыть всем) —
 * это просто «кто отвечает за комнату» в подписи и точка расширения:
 * когда права появятся, менять придётся только эту функцию.
 */
export function hostOf(
  participants: readonly RoomParticipant[],
  now: number,
): string | null {
  return liveParticipants(participants, now)[0]?.userId ?? null;
}

/**
 * Пускать ли человека. Потолок считается по ЖИВЫМ: место, освободившееся
 * после уехавшего в тоннель, должно достаться тому, кто стучится сейчас, —
 * иначе комната залипает «полной» на TTL мёртвого участника.
 */
export function joinDecision(
  participants: readonly RoomParticipant[],
  userId: string,
  now: number,
  status: 'live' | 'ended' = 'live',
): JoinDecision {
  if (status === 'ended') return { kind: 'deny', reason: 'ended' };
  const live = liveParticipants(participants, now);
  if (live.some((p) => p.userId === userId)) return { kind: 'rejoin' };
  if (live.length >= GROUP_CALL_MAX_PARTICIPANTS)
    return { kind: 'deny', reason: 'full' };
  return { kind: 'join' };
}

export const JOIN_DENIAL_TEXT: Record<JoinDenial, string> = {
  full: `В звонке уже ${GROUP_CALL_MAX_PARTICIPANTS} человека — больше пока нельзя`,
  ended: 'Этот звонок уже закончился',
};

/**
 * Кому МЫ отправляем offer. Правило одно и то же на обеих сторонах пары, и
 * из него выводится, кто ждёт: позже вошедший делает offer всем, кто уже был.
 *
 * Без такого правила mesh даёт glare — обе стороны пары выставляют offer
 * одновременно, и `webrtc-signal-guard.ts` честно отбрасывает один из них,
 * а соединение не поднимается вовсе. Жёсткие роли caller/callee звонка
 * один на один здесь не работают: «звонивший» один, а пар — до шести.
 *
 * Возвращает id по тому же порядку, что и `liveParticipants`, — клиенту
 * удобно поднимать соединения предсказуемой очередью.
 */
export function offerTargets(
  participants: readonly RoomParticipant[],
  selfId: string,
  now: number,
): string[] {
  const live = liveParticipants(participants, now);
  const selfIndex = live.findIndex((p) => p.userId === selfId);
  if (selfIndex < 0) return [];
  return live.slice(0, selfIndex).map((p) => p.userId);
}

/** С кем мы вообще держим соединение: все живые, кроме себя. */
export function peersOf(
  participants: readonly RoomParticipant[],
  selfId: string,
  now: number,
): string[] {
  return liveParticipants(participants, now)
    .filter((p) => p.userId !== selfId)
    .map((p) => p.userId);
}

/**
 * Сколько соединений держит вся комната. Не украшение: именно это число
 * растёт квадратично и упирает mesh в потолок — 4 человека это 6 связей и
 * по 3 на телефон, 5 было бы уже 10 и по 4.
 */
export function meshConnectionCount(participantCount: number): number {
  if (participantCount < 2) return 0;
  return (participantCount * (participantCount - 1)) / 2;
}

/** Пора ли закрывать комнату: живых не осталось. */
export function shouldEndRoom(
  participants: readonly RoomParticipant[],
  now: number,
): boolean {
  return liveParticipants(participants, now).length === 0;
}

/**
 * Подпись комнаты для ленты беседы, когда звонок закончился. Формулировку
 * собирает тот, кто показывает, — здесь только сервер-сторона записи в
 * ленту, как у `call-summary.ts` звонка один на один.
 */
export function groupCallSummaryBody(
  participantCount: number,
  seconds: number,
): string {
  if (participantCount === 0) return 'Групповой звонок не состоялся';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const duration =
    minutes > 0 ? `${minutes} мин ${rest} с` : `${Math.max(rest, 0)} с`;
  return `Групповой звонок · ${participantCount} ${pluralPeople(participantCount)} · ${duration}`;
}

function pluralPeople(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'участников';
  switch (count % 10) {
    case 1:
      return 'участник';
    case 2:
    case 3:
    case 4:
      return 'участника';
    default:
      return 'участников';
  }
}
