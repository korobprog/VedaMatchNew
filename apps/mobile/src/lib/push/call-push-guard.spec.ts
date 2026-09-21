import { isCallRelatedPushUrl } from './call-push-guard';

describe('isCallRelatedPushUrl', () => {
  it('url звонка (входящий/пропущенный) — распознаётся', () => {
    expect(isCallRelatedPushUrl('/chat/conv-1?call=call-1')).toBe(true);
  });

  it('call не первый параметр — тоже распознаётся', () => {
    expect(isCallRelatedPushUrl('/chat/conv-1?tab=info&call=call-1')).toBe(true);
  });

  it('обычная беседа без call — не звонок', () => {
    expect(isCallRelatedPushUrl('/chat/conv-1')).toBe(false);
  });

  it('null — не звонок', () => {
    expect(isCallRelatedPushUrl(null)).toBe(false);
  });

  it('слово "call" внутри пути, не как параметр — не звонок (не ложное срабатывание)', () => {
    expect(isCallRelatedPushUrl('/chat/recall-history')).toBe(false);
  });

  /**
   * Оповещение о ГРУППОВОМ звонке (VED-293) — обычное уведомление «в беседе
   * идёт звонок», а не нативный вызов, и глушить его на переднем плане
   * нельзя: человек с открытым списком бесед иначе не узнает о звонке
   * вообще. Сервер поэтому ведёт им на `/chat/<id>` без параметров
   * (`notification-copy.ts`, кейс `chat.group-call-started`) — этот тест
   * стережёт ровно ту связку: если адрес там обрастёт `?call=`, здесь
   * покраснеет.
   */
  it('оповещение о групповом звонке звонком не считается', () => {
    expect(isCallRelatedPushUrl('/chat/conv-1')).toBe(false);
  });
});
