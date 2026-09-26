import type { ChatAttachmentDto, ChatGroupCallDto } from '@vedamatch/shared';
import { CHAT_GROUP_CALL_MESSAGE_SOURCE } from '@vedamatch/shared';
import { joinAction, seatsLabel } from './group-call-banner-text';
import type { GroupCallPhase } from './group-call-state';

/**
 * Карточка группового звонка в ленте беседы: что на ней написать и есть ли
 * кнопка.
 *
 * Сервер пишет карточку, когда комната открывается, и правит её, когда
 * закрывается (`durationSec` заполнен — звонок завершён). Всё живое — «2 из
 * 4», «Мест нет», «Вернуться» — берётся не из карточки, а из состояния
 * комнаты у провайдера: в базе оно устарело бы через секунду.
 */

export interface GroupCallCardView {
  /** «Звонок начался» / «Звонок завершён». */
  title: string;
  /** «2 из 4» у идущего, длительность у завершённого, `null` — нечего сказать. */
  detail: string | null;
  live: boolean;
  /** Кнопка; `null` — кнопки нет вовсе (звонок кончился или ещё не ясно). */
  action: {
    label: string;
    /** `return` — к своему звонку, `join` — вход в комнату по её id. */
    kind: 'join' | 'return';
    blocked: boolean;
  } | null;
}

/** Это карточка группового звонка, а не запись о звонке один на один. */
export function isGroupCallCard(attachment: ChatAttachmentDto): boolean {
  return (
    attachment.kind === 'call' &&
    attachment.sourceService === CHAT_GROUP_CALL_MESSAGE_SOURCE &&
    Boolean(attachment.sourceId)
  );
}

export function groupCallCardView(
  attachment: Pick<ChatAttachmentDto, 'sourceId' | 'subtitle' | 'durationSec'>,
  context: {
    /** Идущий звонок в беседе карточки (плашка знает его же). */
    live: ChatGroupCallDto | null;
    /** Звонок, в котором мы прямо сейчас (фаза `active`). */
    own: ChatGroupCallDto | null;
    selfId: string;
    phase: GroupCallPhase;
  },
): GroupCallCardView {
  const callId = attachment.sourceId ?? '';
  const { live, own, selfId, phase } = context;

  // Закрытие записал сервер — это окончательно, что бы ни думал клиент.
  if (attachment.durationSec !== null && attachment.durationSec !== undefined)
    return ended(attachment.subtitle ?? null);

  if (own && own.id === callId)
    return {
      title: 'Звонок начался',
      detail: seatsLabel(own),
      live: true,
      action: { label: 'Вернуться в звонок', kind: 'return', blocked: false },
    };

  if (live && live.status === 'live' && live.id === callId) {
    const join = joinAction(live, selfId, phase, own !== null, 'Войти в звонок');
    return {
      title: 'Звонок начался',
      detail: seatsLabel(live),
      live: true,
      action: { label: join.label, kind: 'join', blocked: join.blocked },
    };
  }

  // В беседе идёт ДРУГАЯ комната — значит, эта уже закрыта, а правка
  // карточки до нас не дошла.
  if (live && live.id !== callId) return ended(null);

  // Провайдер ещё не знает, идёт ли звонок (беседу только открыли и ответ
  // сервера в пути). Кнопку не рисуем: «Войти» в закрытую комнату — отказ,
  // а «завершён» у идущего звонка — неправда. Как только ответ придёт,
  // карточка станет одной из веток выше.
  return { title: 'Звонок начался', detail: null, live: true, action: null };
}

function ended(duration: string | null): GroupCallCardView {
  return { title: 'Звонок завершён', detail: duration, live: false, action: null };
}
