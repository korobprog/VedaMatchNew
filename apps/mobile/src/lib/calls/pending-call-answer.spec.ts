import { PendingCallAnswer } from './pending-call-answer';

describe('PendingCallAnswer', () => {
  it('нет запроса — consume() ничего не находит', () => {
    const pending = new PendingCallAnswer();
    expect(pending.consume('call-1')).toBe(false);
    expect(pending.hasPending()).toBe(false);
  });

  it('request() запоминает callId, consume() тем же id — true, один раз', () => {
    const pending = new PendingCallAnswer();
    pending.request('call-1');
    expect(pending.hasPending()).toBe(true);
    expect(pending.consume('call-1')).toBe(true);
    expect(pending.hasPending()).toBe(false);
    expect(pending.consume('call-1')).toBe(false);
  });

  it('consume() с другим callId не срабатывает и не стирает запрос', () => {
    const pending = new PendingCallAnswer();
    pending.request('call-1');
    expect(pending.consume('call-2')).toBe(false);
    expect(pending.hasPending()).toBe(true);
    expect(pending.consume('call-1')).toBe(true);
  });

  it('повторный request() тем же callId — не создаёт второй отложенный ответ (двойной accept невозможен)', () => {
    const pending = new PendingCallAnswer();
    pending.request('call-1');
    pending.request('call-1'); // например, и getLaunchCall(), и JS-событие answer для одного звонка
    expect(pending.consume('call-1')).toBe(true);
    expect(pending.consume('call-1')).toBe(false);
  });

  it('новый request() для другого callId заменяет предыдущий', () => {
    const pending = new PendingCallAnswer();
    pending.request('call-1');
    pending.request('call-2');
    expect(pending.consume('call-1')).toBe(false);
    expect(pending.consume('call-2')).toBe(true);
  });

  it('clear() снимает отложенный ответ без потребления', () => {
    const pending = new PendingCallAnswer();
    pending.request('call-1');
    pending.clear();
    expect(pending.hasPending()).toBe(false);
    expect(pending.consume('call-1')).toBe(false);
  });
});
