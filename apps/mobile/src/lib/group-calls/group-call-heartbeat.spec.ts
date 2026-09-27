import {
  GROUP_CALL_HEARTBEAT_MS,
  GROUP_CALL_TTL_MS,
  HEARTBEAT_FAILURES_BEFORE_LOST,
  HEARTBEAT_MIN_GAP_MS,
  heartbeatDue,
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

describe('два источника подтверждений (VED-360)', () => {
  const T = 1_700_000_000_000;

  it('первое подтверждение уходит всегда', () => {
    expect(heartbeatDue(null, T)).toBe(true);
  });

  it('таймер и нативный тик на переднем плане не дублируют друг друга', () => {
    expect(heartbeatDue(T, T + 5_000)).toBe(false);
  });

  it('следующий шаг проходит, даже если тик приплыл на пару секунд раньше', () => {
    expect(heartbeatDue(T, T + GROUP_CALL_HEARTBEAT_MS - 2_000)).toBe(true);
  });

  it('порог меньше шага: иначе один источник тикал бы через раз', () => {
    expect(HEARTBEAT_MIN_GAP_MS).toBeLessThan(GROUP_CALL_HEARTBEAT_MS);
  });

  it('в фоне, где тикает только служба, успевает до TTL сервера', () => {
    // Три шага службы — это ещё не TTL: два подтверждения укладываются.
    expect(2 * GROUP_CALL_HEARTBEAT_MS).toBeLessThan(GROUP_CALL_TTL_MS);
  });

  it('возврат на экран подтверждает сразу, не дожидаясь шага', () => {
    expect(heartbeatDue(T, T + 1_000, true)).toBe(true);
  });
});
