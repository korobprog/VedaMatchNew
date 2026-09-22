import type { ChatCallDto } from '@vedamatch/shared';
import {
  companionOf,
  endedLabel,
  IDLE_STATE,
  reduceCall,
  roleIn,
  type CallState,
} from './call-machine';

const me = { id: 'me', name: 'Я', avatarUrl: null, lastSeenAt: null };
const other = { id: 'other', name: 'Собеседник', avatarUrl: null, lastSeenAt: null };

const call = (over: Partial<ChatCallDto> = {}): ChatCallDto => ({
  id: 'c1',
  conversationId: 'conv',
  kind: 'audio',
  status: 'ringing',
  caller: other,
  callee: me,
  createdAt: '2026-09-09T10:00:00Z',
  ...over,
});

const incoming = (): CallState =>
  reduceCall(IDLE_STATE, {
    type: 'stream',
    event: { type: 'call.ringing', call: call() },
    selfId: 'me',
  });

describe('reduceCall', () => {
  it('входящий из idle — фаза incoming, звонок запомнен', () => {
    const state = incoming();
    expect(state.phase).toBe('incoming');
    expect(state.call?.id).toBe('c1');
    expect(roleIn(state, 'me')).toBe('callee');
  });

  it('второй входящий во время первого игнорируется', () => {
    const state = incoming();
    const next = reduceCall(state, {
      type: 'stream',
      event: { type: 'call.ringing', call: call({ id: 'c2' }) },
      selfId: 'me',
    });
    expect(next).toBe(state);
  });

  it('исходящий: POST → outgoing, accepted → connecting, connected → active', () => {
    const mine = call({ caller: me, callee: other });
    let state = reduceCall(IDLE_STATE, { type: 'outgoing-started', call: mine });
    expect(state.phase).toBe('outgoing');
    state = reduceCall(state, {
      type: 'stream',
      event: { type: 'call.accepted', call: { ...mine, status: 'accepted' } },
      selfId: 'me',
    });
    expect(state.phase).toBe('connecting');
    state = reduceCall(state, { type: 'connected', at: 1000 });
    expect(state.phase).toBe('active');
    expect(state.connectedAt).toBe(1000);
  });

  it('событие ringing о своём же исходящем не сбрасывает фазу', () => {
    const mine = call({ caller: me, callee: other });
    const outgoing = reduceCall(IDLE_STATE, { type: 'outgoing-started', call: mine });
    const next = reduceCall(outgoing, {
      type: 'stream',
      event: { type: 'call.ringing', call: mine },
      selfId: 'me',
    });
    expect(next.phase).toBe('outgoing');
  });

  // ---- VED-346: несколько своих устройств в одном аккаунте ----

  it('свой исходящий с другого устройства не поднимает звонок здесь', () => {
    // Телефон и вкладка сайта под одним аккаунтом: события рассылаются на
    // все устройства человека, но вызов идёт не отсюда.
    const mine = call({ caller: me, callee: other });
    const next = reduceCall(IDLE_STATE, {
      type: 'stream',
      event: { type: 'call.ringing', call: mine },
      selfId: 'me',
    });
    expect(next.phase).toBe('idle');
    expect(next.call).toBeNull();
  });

  it('свой исходящий отсюда поднимается и тогда, когда событие обогнало ответ POST', () => {
    const mine = call({ caller: me, callee: other });
    const starting = reduceCall(IDLE_STATE, { type: 'outgoing-starting' });
    expect(starting.phase).toBe('idle');
    const next = reduceCall(starting, {
      type: 'stream',
      event: { type: 'call.ringing', call: mine },
      selfId: 'me',
    });
    expect(next.phase).toBe('outgoing');
    expect(next.call?.id).toBe('c1');
  });

  it('ответили на другом устройстве — «Принять» здесь исчезает', () => {
    const next = reduceCall(incoming(), {
      type: 'stream',
      event: { type: 'call.accepted', call: call({ status: 'accepted' }) },
      selfId: 'me',
    });
    expect(next).toEqual(IDLE_STATE);
  });

  // ---- VED-358: «Принять» нажали здесь, а камеру ещё спрашивают ----

  it('`call.accepted` в дырке между нажатием «Принять» и запросом камеры не гасит звонок', () => {
    // Живая поломка 22.09: `accept()` ставит `accepting` только ПОСЛЕ
    // запроса ICE-серверов по сети и `getUserMedia` (на первом видеозвонке
    // там ещё и системный вопрос о доступе к камере, который ждёт
    // человека). Всё это время фаза здесь `incoming`, и правило VED-346
    // «в `incoming` пришёл `call.accepted` — значит ответили на другом
    // устройстве» срабатывало на собственном же ответе.
    const answering = reduceCall(incoming(), { type: 'answering' });
    expect(answering.phase).toBe('incoming');
    const next = reduceCall(answering, {
      type: 'stream',
      event: { type: 'call.accepted', call: call({ status: 'accepted' }) },
      selfId: 'me',
    });
    expect(next.phase).toBe('connecting');
    expect(next.call?.status).toBe('accepted');
  });

  it('метка «отвечаем здесь» ставится только из фазы входящего', () => {
    expect(reduceCall(IDLE_STATE, { type: 'answering' })).toEqual(IDLE_STATE);
  });

  it('метка «отвечаем здесь» не переживает следующий звонок', () => {
    const answering = reduceCall(incoming(), { type: 'answering' });
    const reset = reduceCall(answering, { type: 'reset' });
    const again = reduceCall(reset, {
      type: 'stream',
      event: { type: 'call.ringing', call: call({ id: 'c2' }) },
      selfId: 'me',
    });
    expect(again.phase).toBe('incoming');
    const next = reduceCall(again, {
      type: 'stream',
      event: { type: 'call.accepted', call: call({ id: 'c2', status: 'accepted' }) },
      selfId: 'me',
    });
    expect(next).toEqual(IDLE_STATE);
  });

  it('ответившее устройство на том же событии остаётся в звонке', () => {
    const answering = reduceCall(incoming(), { type: 'accepting' });
    const next = reduceCall(answering, {
      type: 'stream',
      event: { type: 'call.accepted', call: call({ status: 'accepted' }) },
      selfId: 'me',
    });
    expect(next.phase).toBe('connecting');
    expect(next.call?.status).toBe('accepted');
  });

  it('принятие входящего: accepting → connecting, дальше как обычно', () => {
    let state = reduceCall(incoming(), { type: 'accepting' });
    expect(state.phase).toBe('connecting');
    state = reduceCall(state, { type: 'connected', at: 5 });
    expect(state.phase).toBe('active');
  });

  it('call.ended с сервера завершает любой живой звонок и хранит исход', () => {
    const state = reduceCall(incoming(), {
      type: 'stream',
      event: { type: 'call.ended', call: call({ status: 'cancelled' }) },
      selfId: 'me',
    });
    expect(state.phase).toBe('ended');
    expect(state.endedStatus).toBe('cancelled');
  });

  it('call.ended о чужом звонке не трогает состояние', () => {
    const state = incoming();
    const next = reduceCall(state, {
      type: 'stream',
      event: { type: 'call.ended', call: call({ id: 'zzz', status: 'ended' }) },
      selfId: 'me',
    });
    expect(next).toBe(state);
  });

  it('обрыв в active ставит reconnecting, восстановление снимает', () => {
    let state = reduceCall(reduceCall(incoming(), { type: 'accepting' }), {
      type: 'connected',
      at: 1,
    });
    state = reduceCall(state, { type: 'disconnected' });
    expect(state.reconnecting).toBe(true);
    state = reduceCall(state, { type: 'connected', at: 2 });
    expect(state.reconnecting).toBe(false);
    expect(state.connectedAt).toBe(1);
  });

  it('restore: ringing даёт incoming/outgoing по роли, accepted — connecting', () => {
    expect(
      reduceCall(IDLE_STATE, { type: 'restore', call: call(), selfId: 'me' }).phase,
    ).toBe('incoming');
    expect(
      reduceCall(IDLE_STATE, {
        type: 'restore',
        call: call({ caller: me, callee: other }),
        selfId: 'me',
      }).phase,
    ).toBe('outgoing');
    expect(
      reduceCall(IDLE_STATE, {
        type: 'restore',
        call: call({ status: 'accepted' }),
        selfId: 'me',
      }).phase,
    ).toBe('connecting');
  });

  it('preview из idle — incoming с флагом callIsPreview, повторно не перебивает живой звонок', () => {
    const previewed = reduceCall(IDLE_STATE, { type: 'preview', call: call() });
    expect(previewed.phase).toBe('incoming');
    expect(previewed.callIsPreview).toBe(true);
    expect(previewed.call?.id).toBe('c1');

    // Уже что-то идёт (например, настоящий call.ringing по SSE успел раньше
    // фонового launch-события) — предпросмотр не должен перебить состояние.
    const alreadyIncoming = incoming();
    expect(reduceCall(alreadyIncoming, { type: 'preview', call: call({ id: 'c2' }) })).toBe(
      alreadyIncoming,
    );
  });

  it('restore поверх preview снимает флаг callIsPreview (реконсайл подтвердил настоящие данные)', () => {
    const previewed = reduceCall(IDLE_STATE, { type: 'preview', call: call() });
    const restored = reduceCall(previewed, { type: 'restore', call: call(), selfId: 'me' });
    expect(restored.callIsPreview).toBe(false);
    expect(restored.phase).toBe('incoming');
  });

  it('reset возвращает в idle, local-ended в idle ничего не делает', () => {
    const ended = reduceCall(incoming(), { type: 'local-ended', status: 'declined' });
    expect(ended.phase).toBe('ended');
    expect(reduceCall(ended, { type: 'reset' })).toEqual(IDLE_STATE);
    expect(reduceCall(IDLE_STATE, { type: 'local-ended', status: 'ended' })).toBe(
      IDLE_STATE,
    );
  });

  it('mute и камера переключаются', () => {
    const state = reduceCall(reduceCall(IDLE_STATE, { type: 'toggle-mute' }), {
      type: 'toggle-camera',
    });
    expect(state.muted).toBe(true);
    expect(state.cameraOff).toBe(true);
  });
});

describe('helpers', () => {
  it('companionOf выбирает не нас', () => {
    expect(companionOf(call(), 'me').id).toBe('other');
    expect(companionOf(call(), 'other').id).toBe('me');
  });

  it('endedLabel различает роль там, где это важно', () => {
    expect(endedLabel('missed', 'caller')).toBe('Не ответили');
    expect(endedLabel('missed', 'callee')).toBe('Пропущенный звонок');
    expect(endedLabel('declined', 'caller')).toBe('Собеседник отклонил звонок');
    expect(endedLabel('ended', null)).toBe('Звонок завершён');
  });
});
