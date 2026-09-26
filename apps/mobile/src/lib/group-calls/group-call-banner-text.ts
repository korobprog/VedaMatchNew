import type { ChatGroupCallDto } from '@vedamatch/shared';
import type { GroupCallPhase } from './group-call-state';

/**
 * Что написать на плашке группового звонка и на карточке звонка в ленте и
 * что они делают по нажатию.
 *
 * Жалоба, из-за которой это переписано: «когда входишь в чат конференции —
 * непонятно, как попасть в звонок». Поэтому у входа в звонок три двери, и
 * говорят они одно и то же:
 * - плашка над перепиской (`GroupCallStrip`): «Идёт звонок · 2 из 4 · Войти»;
 * - карточка в ленте (`GroupCallCard`): «Звонок начался · Войти в звонок»,
 *   после конца — «Звонок завершён · 12:05»;
 * - плавающая плашка на любом другом экране (`GroupCallBanner`): возврат к
 *   своему звонку, когда экран звонка свёрнут.
 *
 * Все три ведут в один и тот же `join` провайдера или на экран своего
 * звонка — нового пути подключения нет. Правило «какую кнопку показать»
 * одно на все три и
 * живёт здесь, чистой функцией: это ровно та развилка, которую легко
 * сломать правкой в JSX и невозможно заметить глазом.
 *
 * Тот же модуль — на сайте (`apps/web/src/components/chat/calls/group/`);
 * тексты обязаны совпадать.
 */

export interface GroupCallBannerText {
  kind: 'own' | 'invite';
  callId: string;
  title: string;
  action: string;
  /**
   * Нажатие ничего не даст: мест нет, вход уже идёт, мы уже в звонке.
   * Флагом, а не сравнением подписи с «Войти» в разметке — подпись
   * меняется, а погасшая кнопка не должна зависеть от того, как её назвали.
   */
  blocked: boolean;
}

/** «2 из 4» — занято мест из потолка mesh'а. */
export function seatsLabel(call: ChatGroupCallDto): string {
  return `${call.participants.length} из ${call.maxParticipants}`;
}

/**
 * Плавающая плашка «вернуться в свой звонок» — на любом экране, пока экран
 * звонка свёрнут. В беседе самого звонка её заменяет плашка над перепиской, и
 * двух одинаковых строк на экране быть не должно — это решает вызывающий
 * по `own.conversationId`.
 */
export function ownCallBanner(own: ChatGroupCallDto): GroupCallBannerText {
  return {
    kind: 'own',
    callId: own.id,
    title: `Вы в звонке · ${seatsLabel(own)}`,
    action: 'Вернуться в звонок',
    blocked: false,
  };
}

/**
 * Плашка над перепиской открытой беседы.
 *
 * Свой звонок в этой беседе важнее чужого приглашения: если мы уже внутри,
 * плашка ведёт назад, а не предлагает «войти» в тот же звонок.
 */
export function conversationCallStrip(
  conversationId: string,
  /** Звонок, в котором мы прямо сейчас (фаза `active`). */
  own: ChatGroupCallDto | null,
  /** Идущий звонок в этой беседе. */
  inConversation: ChatGroupCallDto | null,
  selfId: string,
  phase: GroupCallPhase,
): GroupCallBannerText | null {
  if (own && own.conversationId === conversationId) return ownCallBanner(own);
  if (!inConversation || inConversation.status !== 'live') return null;

  const join = joinAction(inConversation, selfId, phase, own !== null, 'Войти');
  return {
    kind: 'invite',
    callId: inConversation.id,
    title: `Идёт звонок · ${seatsLabel(inConversation)}`,
    action: join.label,
    blocked: join.blocked,
  };
}

/**
 * Кнопка входа в идущую комнату — общая для плашки и карточки, отличается
 * только основная подпись. Порядок проверок — порядок важности причины:
 * «уже входим» честнее «мест нет», если мы и есть тот, кто занял место.
 */
export function joinAction(
  call: ChatGroupCallDto,
  selfId: string,
  phase: GroupCallPhase,
  inOtherCall: boolean,
  label: string,
): { label: string; blocked: boolean } {
  if (phase === 'joining') return { label: 'Входим…', blocked: true };
  // Второй звонок одновременно телефон не потянет, и сервер бы его не дал.
  if (inOtherCall) return { label: 'Вы в другом звонке', blocked: true };
  // Мы числимся в комнате, но не здесь: звонок идёт на другом устройстве
  // или приложение ещё поднимает медиа после перезапуска. Второй вход тем же
  // аккаунтом отнял бы звук у первого.
  if (call.participants.some((p) => p.user.id === selfId))
    return { label: 'Вы уже в звонке', blocked: true };
  if (call.participants.length >= call.maxParticipants)
    return { label: 'Мест нет', blocked: true };
  return { label, blocked: false };
}

/** «3 человека», «1 человек» — без «участников», плашка узкая. */
export function peopleLabel(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${count} человек`;
  switch (count % 10) {
    case 1:
      return `${count} человек`;
    case 2:
    case 3:
    case 4:
      return `${count} человека`;
    default:
      return `${count} человек`;
  }
}
