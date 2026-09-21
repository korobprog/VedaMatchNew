import { CHAT_GROUP_CALL_MAX_VIDEO } from '@vedamatch/shared';
import { isAlive, liveParticipants, type RoomParticipant } from './group-call-room';

/**
 * Правила видео в комнате (VED-293, этап 4) — чистым модулем, рядом с
 * правилами состава (`group-call-room.ts`) и по той же причине: ошибка
 * здесь означает четвёртую камеру, от которой телефон уходит в троттлинг,
 * либо застрявшее «место занято» у человека, которого в комнате давно нет.
 * Такое проверяют таблицей случаев, а не поднятым Postgres.
 *
 * Главное решение: потолок камер держит СЕРВЕР, а не кнопка на клиенте.
 * Кнопка гаснет по составу, который ей известен, но состав она знает с
 * задержкой события; двое, нажавшие «камеру» одновременно на третье
 * свободное место, обязаны получить разные ответы, и различить их может
 * только тот, кто видит комнату целиком.
 */

export const GROUP_CALL_MAX_VIDEO = CHAT_GROUP_CALL_MAX_VIDEO;

/** Почему камеру включить нельзя. */
export type VideoDenial =
  /** Все `GROUP_CALL_MAX_VIDEO` мест под видео заняты живыми участниками. */
  | 'video-full'
  /** Комната закрыта. */
  | 'ended'
  /** Мы не в этой комнате (вышли, убрал уборщик, другое устройство). */
  | 'not-in-room';

export type VideoDecision =
  /** Менять состояние: записать и разослать остальным. */
  | { kind: 'set'; video: boolean }
  /** Уже так и есть — ни записи, ни рассылки. */
  | { kind: 'noop' }
  | { kind: 'deny'; reason: VideoDenial };

/**
 * Формулировки отказа. Живут на сервере вместе с правилом, а не на
 * клиенте: правило и его объяснение обязаны меняться одной правкой, иначе
 * при первом же изменении потолка сайт и приложение начнут врать
 * по-разному. Клиент показывает пришедший текст как есть
 * (`group-call-error.ts` на вебе).
 */
export const VIDEO_DENIAL_TEXT: Record<VideoDenial, string> = {
  'video-full': `В групповом видео могут участвовать трое — сейчас все ${GROUP_CALL_MAX_VIDEO} камеры заняты`,
  ended: 'Этот звонок уже закончился',
  'not-in-room': 'Вы не в этом звонке',
};

/** Сколько камер включено прямо сейчас — считаем только по ЖИВЫМ. */
export function videoCount(
  participants: readonly RoomParticipant[],
  now: number,
): number {
  return liveParticipants(participants, now).filter((p) => p.video).length;
}

/**
 * Можно ли этому человеку включить (или выключить) камеру.
 *
 * Три вещи, каждая из которых иначе становится багом:
 *
 * 1. **Выключение не отказывают никогда** (кроме закрытой комнаты). Человек
 *    имеет право погасить свою камеру в любом состоянии, и если его строка
 *    почему-то говорит «видео включено» в комнате, где мест уже нет,
 *    выключение — ровно то, что чинит ситуацию.
 * 2. **Потолок считается по живым**, как и потолок участников: уехавший в
 *    тоннель не должен держать место под видео до конца своего TTL.
 * 3. **Уже включённая камера не занимает второе место.** Повторный
 *    `{video:true}` от того, у кого она и так включена, — это не попытка
 *    занять место, а повтор после переподключения; отказ здесь означал бы,
 *    что человек теряет своё же видео при любом обрыве сети.
 */
export function videoDecision(
  participants: readonly RoomParticipant[],
  userId: string,
  wantVideo: boolean,
  now: number,
  status: 'live' | 'ended' = 'live',
): VideoDecision {
  if (status === 'ended') return { kind: 'deny', reason: 'ended' };

  const self = participants.find((p) => p.userId === userId);
  if (!self || !isAlive(self, now))
    return { kind: 'deny', reason: 'not-in-room' };

  if (self.video === wantVideo) return { kind: 'noop' };
  if (!wantVideo) return { kind: 'set', video: false };

  if (videoCount(participants, now) >= GROUP_CALL_MAX_VIDEO)
    return { kind: 'deny', reason: 'video-full' };
  return { kind: 'set', video: true };
}

/**
 * Свободно ли ещё место под камеру — для клиента, который решает, гасить
 * ли кнопку заранее. Это ПОДСКАЗКА, а не право: настоящий ответ даёт
 * `videoDecision` на сервере в момент нажатия.
 */
export function videoSlotsLeft(
  participants: readonly RoomParticipant[],
  now: number,
): number {
  return Math.max(GROUP_CALL_MAX_VIDEO - videoCount(participants, now), 0);
}

/**
 * Кого надо погасить, когда состав изменился.
 *
 * Сам по себе выход участника мест не отнимает, так что штатно список
 * пуст. Но два пути приводят к «камер больше, чем мест»: потолок опустили
 * правкой кода, пока комнаты жили, либо строки разъехались с правилом
 * из-за ручного вмешательства в базу. Тогда лишние гасятся по тому же
 * порядку, по которому комната живёт вообще, — раньше вошедший остаётся,
 * позже вошедший гаснет. Любой другой порядок («погасить случайных»,
 * «погасить всех») читается как поломка.
 */
export function videoToTurnOff(
  participants: readonly RoomParticipant[],
  now: number,
): string[] {
  const withVideo = liveParticipants(participants, now).filter((p) => p.video);
  if (withVideo.length <= GROUP_CALL_MAX_VIDEO) return [];
  return withVideo.slice(GROUP_CALL_MAX_VIDEO).map((p) => p.userId);
}
