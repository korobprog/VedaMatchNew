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
});
