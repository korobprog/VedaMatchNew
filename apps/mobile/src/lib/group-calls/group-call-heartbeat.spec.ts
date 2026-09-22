import {
  GROUP_CALL_HEARTBEAT_MS,
  GROUP_CALL_TTL_MS,
  HEARTBEAT_FAILURES_BEFORE_LOST,
  heartbeatLost,
} from './group-call-heartbeat';

describe('сторож подтверждений присутствия', () => {
  it('одна осечка не выводит из звонка', () => {
    // Лифт, переключение Wi-Fi → LTE: сервер такое переживает, и экран
    // обязан пережить тоже.
    expect(heartbeatLost(1)).toBe(false);
  });

  it('две подряд — всё ещё не повод', () => {
    expect(heartbeatLost(2)).toBe(false);
  });

  it('три подряд означают, что сервер нас уже убрал', () => {
    expect(heartbeatLost(HEARTBEAT_FAILURES_BEFORE_LOST)).toBe(true);
  });

  it('дальше порога состояние не отыгрывается назад', () => {
    expect(heartbeatLost(HEARTBEAT_FAILURES_BEFORE_LOST + 5)).toBe(true);
  });

  it('без единой осечки мы в звонке', () => {
    expect(heartbeatLost(0)).toBe(false);
  });

  it('порог выведен из сроков сервера, а не записан числом', () => {
    // Если сервер поменяет TTL, порог обязан поехать за ним сам.
    expect(HEARTBEAT_FAILURES_BEFORE_LOST).toBe(
      Math.ceil(GROUP_CALL_TTL_MS / GROUP_CALL_HEARTBEAT_MS),
    );
    // И порог обязан быть достижим раньше, чем сервер потеряет терпение:
    // иначе о выпадении человек узнавал бы уже после того, как исчез.
    expect(HEARTBEAT_FAILURES_BEFORE_LOST * GROUP_CALL_HEARTBEAT_MS).toBe(
      GROUP_CALL_TTL_MS,
    );
  });
});
