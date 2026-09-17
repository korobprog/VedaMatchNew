import { CallLifecycleTracker } from './call-push-dedup';

describe('CallLifecycleTracker', () => {
  it('первый call.incoming — звонить', () => {
    const tracker = new CallLifecycleTracker();
    expect(tracker.handleIncoming('call-1', 0)).toBe('ring');
  });

  it('повторный call.incoming тем же id, пока звонит, — дубликат', () => {
    const tracker = new CallLifecycleTracker();
    tracker.handleIncoming('call-1', 0);
    expect(tracker.handleIncoming('call-1', 1000)).toBe('duplicate');
  });

  it('другой callId звонит независимо', () => {
    const tracker = new CallLifecycleTracker();
    tracker.handleIncoming('call-1', 0);
    expect(tracker.handleIncoming('call-2', 0)).toBe('ring');
  });

  it('call.ended в первый раз — погасить', () => {
    const tracker = new CallLifecycleTracker();
    tracker.handleIncoming('call-1', 0);
    expect(tracker.handleEnded('call-1', 500)).toBe('end');
  });

  it('повторный call.ended тем же id — дубликат', () => {
    const tracker = new CallLifecycleTracker();
    tracker.handleIncoming('call-1', 0);
    tracker.handleEnded('call-1', 500);
    expect(tracker.handleEnded('call-1', 600)).toBe('duplicate');
  });

  it('call.ended без предшествующего call.incoming всё равно гасит один раз', () => {
    const tracker = new CallLifecycleTracker();
    expect(tracker.handleEnded('call-1', 0)).toBe('end');
    expect(tracker.handleEnded('call-1', 1)).toBe('duplicate');
  });

  it('новый call.incoming после ended (перезвонили) снова звонит', () => {
    const tracker = new CallLifecycleTracker();
    tracker.handleIncoming('call-1', 0);
    tracker.handleEnded('call-1', 500);
    expect(tracker.handleIncoming('call-1', 600)).toBe('ring');
  });

  it('запись стирается по TTL — тот же id после долгой паузы звонит заново', () => {
    const tracker = new CallLifecycleTracker(1000);
    tracker.handleIncoming('call-1', 0);
    tracker.handleEnded('call-1', 100);
    expect(tracker.handleIncoming('call-1', 100 + 1000 + 1)).toBe('ring');
  });

  it('isRinging — true после handleIncoming, false до него, false после handleEnded, чтение не меняет запись', () => {
    const tracker = new CallLifecycleTracker();
    expect(tracker.isRinging('call-1', 0)).toBe(false);
    tracker.handleIncoming('call-1', 0);
    expect(tracker.isRinging('call-1', 10)).toBe(true);
    expect(tracker.isRinging('call-1', 20)).toBe(true); // повторное чтение не гасит
    tracker.handleEnded('call-1', 30);
    expect(tracker.isRinging('call-1', 40)).toBe(false);
  });
});
