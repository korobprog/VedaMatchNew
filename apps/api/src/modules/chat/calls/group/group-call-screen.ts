import {
  isAlive,
  liveParticipants,
  type RoomParticipant,
} from './group-call-room';
import { GROUP_CALL_MAX_VIDEO, videoCount } from './group-call-video';

/**
 * Показ экрана в групповой комнате (VED-360) — чистым модулем, рядом с
 * правилами камер (`group-call-video.ts`) и по той же причине: ошибка здесь
 * даёт либо четвёртое видео в обход потолка, либо два экрана сразу, и
 * проверять это надо таблицей случаев, а не поднятым Postgres.
 *
 * Как устроен показ, из чего и следуют правила:
 *
 * - экран не заводит новую видеосекцию. Клиент подменяет камеру экраном в
 *   ТОМ ЖЕ отправителе (`replaceTrack`), без пересогласования SDP — ровно
 *   тем путём, которым камера включается и гаснет (`group-video-link.ts`).
 *   Значит для mesh'а экран — такое же видео, и **место под видео он
 *   занимает то же самое**: показывающему нужно место, как для камеры;
 *   у кого камера уже включена, тот своё место просто переиспользует;
 * - остальным надо знать, что в плитке экран, а не лицо: его показывают
 *   целиком (`contain`) и крупно. Этот признак — поле `screen` участника,
 *   оно ездит тем же `POST /state` → `group-call.updated`, что и камера;
 * - **экран в комнате один.** Двое, показывающие одновременно, — это две
 *   крупные плитки, между которыми нечего выбрать, и удвоенная нагрузка на
 *   кодеры. Решает сервер: он один видит комнату целиком, и двое, нажавшие
 *   «показать» одновременно, обязаны получить разные ответы.
 *
 * Гонку двух показывающих держит частичный уникальный индекс
 * `ChatGroupCallParticipant_one_screen_per_call` (миграция
 * `chat_group_call_screen`), а не только эта функция: между решением и
 * записью лежит запрос к базе, а API работает не в одном экземпляре.
 */

/** Почему показать экран нельзя. */
export type ScreenDenial =
  /** Экран уже показывает другой живой участник. */
  | 'screen-busy'
  /** Все места под видео заняты, а своей камеры, чьё место можно взять, нет. */
  | 'video-full'
  | 'ended'
  | 'not-in-room';

export type ScreenDecision =
  /**
   * Записать. `screen: true` всегда идёт с `video: true` — экран занимает
   * место под видео; `screen: false` поле `video` не трогает: вернётся ли
   * камера, решает клиент тем же запросом (`video` рядом).
   */
  | { kind: 'set'; screen: boolean }
  | { kind: 'noop' }
  /** `holderId` — кто уже показывает, для текста «Экран показывает …». */
  | { kind: 'deny'; reason: ScreenDenial; holderId?: string };

/**
 * Кто показывает экран. Среди ЖИВЫХ: уехавший в тоннель не держит показ
 * до конца своего TTL. Если по какой-то причине показывающих двое (строки
 * испорчены руками), побеждает раньше вошедший — тот же порядок, по
 * которому комната живёт вообще.
 */
export function screenSharer(
  participants: readonly RoomParticipant[],
  now: number,
): string | null {
  return (
    liveParticipants(participants, now).find((p) => p.screen)?.userId ?? null
  );
}

/**
 * Можно ли этому человеку начать (или закончить) показ экрана.
 *
 * - **Закончить показ не отказывают никогда** (кроме закрытой комнаты) —
 *   по той же причине, по которой не отказывают выключить камеру.
 * - **Занят чужим показом** — отказ с именем показывающего: «кнопка не
 *   работает» без объяснения читается как поломка.
 * - **Место под видео.** Своя включённая камера отдаёт место экрану; без
 *   неё нужно свободное место, как для камеры.
 */
export function screenDecision(
  participants: readonly RoomParticipant[],
  userId: string,
  wantScreen: boolean,
  now: number,
  status: 'live' | 'ended' = 'live',
): ScreenDecision {
  if (status === 'ended') return { kind: 'deny', reason: 'ended' };

  const self = participants.find((p) => p.userId === userId);
  if (!self || !isAlive(self, now))
    return { kind: 'deny', reason: 'not-in-room' };

  if (Boolean(self.screen) === wantScreen) return { kind: 'noop' };
  if (!wantScreen) return { kind: 'set', screen: false };

  const holder = screenSharer(participants, now);
  if (holder && holder !== userId)
    return { kind: 'deny', reason: 'screen-busy', holderId: holder };

  if (!self.video && videoCount(participants, now) >= GROUP_CALL_MAX_VIDEO)
    return { kind: 'deny', reason: 'video-full' };
  return { kind: 'set', screen: true };
}

/**
 * Формулировки отказа — на сервере, рядом с правилом, как
 * `VIDEO_DENIAL_TEXT`: клиент показывает пришедший текст как есть.
 */
export function screenDenialText(
  reason: ScreenDenial,
  holderName?: string | null,
): string {
  switch (reason) {
    case 'screen-busy':
      return holderName
        ? `Экран уже показывает ${holderName} — одновременно показывать может только один`
        : 'Экран уже показывает другой участник — одновременно показывать может только один';
    case 'video-full':
      return `Показ экрана занимает место камеры, а все ${GROUP_CALL_MAX_VIDEO} места под видео заняты`;
    case 'ended':
      return 'Этот звонок уже закончился';
    case 'not-in-room':
      return 'Вы не в этом звонке';
  }
}
