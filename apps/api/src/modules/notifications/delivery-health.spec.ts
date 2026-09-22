import {
  DELIVERY_FAILURE_STREAK,
  DELIVERY_MARK_GRACE_MS,
  DELIVERY_SILENCE_MS,
  deliveryPointState,
  judgeDeliveryPoint,
  type DeliveryPointHealth,
} from './delivery-health';

const now = new Date('2026-09-22T12:00:00.000Z');

function ago(ms: number): Date {
  return new Date(now.getTime() - ms);
}

const day = 24 * 60 * 60 * 1000;

function point(patch: Partial<DeliveryPointHealth> = {}): DeliveryPointHealth {
  return {
    createdAt: ago(DELIVERY_SILENCE_MS + day),
    lastSuccessAt: null,
    failureCount: 0,
    lastSeenAt: null,
    deadSince: null,
    ...patch,
  };
}

describe('judgeDeliveryPoint', () => {
  it('молчит давно и накопила неудачи — помечается, а не удаляется', () => {
    expect(
      judgeDeliveryPoint(point({ failureCount: DELIVERY_FAILURE_STREAK }), now),
    ).toBe('mark');
  });

  it('подписка, которой ни разу ничего не отправляли, остаётся: молчать ей нечем', () => {
    expect(judgeDeliveryPoint(point({ failureCount: 0 }), now)).toBe('keep');
  });

  it('одной неудачи меньше порога недостаточно — граница точная', () => {
    expect(
      judgeDeliveryPoint(
        point({ failureCount: DELIVERY_FAILURE_STREAK - 1 }),
        now,
      ),
    ).toBe('keep');
  });

  it('неудачи подряд у подписки, принявшей пуш вчера, — сбой службы, а не смерть', () => {
    expect(
      judgeDeliveryPoint(
        point({ lastSuccessAt: ago(day), failureCount: 20 }),
        now,
      ),
    ).toBe('keep');
  });

  it('ровно на пороге молчания уже мёртвая, на миг раньше — ещё нет', () => {
    const failing = { failureCount: DELIVERY_FAILURE_STREAK };
    expect(
      judgeDeliveryPoint(
        point({ ...failing, lastSuccessAt: ago(DELIVERY_SILENCE_MS) }),
        now,
      ),
    ).toBe('mark');
    expect(
      judgeDeliveryPoint(
        point({ ...failing, lastSuccessAt: ago(DELIVERY_SILENCE_MS - 1) }),
        now,
      ),
    ).toBe('keep');
  });

  it('свежее подтверждение от клиента перебивает и молчание, и неудачи', () => {
    expect(
      judgeDeliveryPoint(
        point({
          failureCount: DELIVERY_FAILURE_STREAK + 5,
          lastSeenAt: ago(day),
        }),
        now,
      ),
    ).toBe('keep');
  });

  it('старое подтверждение клиента подписку уже не защищает', () => {
    expect(
      judgeDeliveryPoint(
        point({
          failureCount: DELIVERY_FAILURE_STREAK,
          lastSeenAt: ago(DELIVERY_SILENCE_MS),
        }),
        now,
      ),
    ).toBe('mark');
  });

  it('помеченная удаляется только по истечении отсрочки', () => {
    const marked = {
      failureCount: DELIVERY_FAILURE_STREAK,
      lastSuccessAt: ago(DELIVERY_SILENCE_MS + DELIVERY_MARK_GRACE_MS + day),
    };
    expect(
      judgeDeliveryPoint(
        point({ ...marked, deadSince: ago(DELIVERY_MARK_GRACE_MS - 1) }),
        now,
      ),
    ).toBe('keep');
    expect(
      judgeDeliveryPoint(
        point({ ...marked, deadSince: ago(DELIVERY_MARK_GRACE_MS) }),
        now,
      ),
    ).toBe('delete');
  });

  it('помеченная, которая снова принимает пуши, не удаляется: успех обнулил счётчик', () => {
    expect(
      judgeDeliveryPoint(
        point({
          failureCount: 0,
          lastSuccessAt: ago(day),
          deadSince: ago(DELIVERY_MARK_GRACE_MS * 2),
        }),
        now,
      ),
    ).toBe('keep');
  });

  it('до первого успеха молчание считается от появления подписки', () => {
    expect(
      judgeDeliveryPoint(
        point({
          createdAt: ago(day),
          failureCount: DELIVERY_FAILURE_STREAK + 10,
        }),
        now,
      ),
    ).toBe('keep');
  });
});

describe('deliveryPointState', () => {
  it('принятый недавно пуш — живая', () => {
    expect(deliveryPointState(point({ lastSuccessAt: ago(day) }), now)).toBe(
      'alive',
    );
  });

  it('свежая подписка без отправок — живая, а не молчащая', () => {
    expect(deliveryPointState(point({ createdAt: ago(day) }), now)).toBe(
      'alive',
    );
  });

  it('ни одного успеха за месяц — молчит', () => {
    expect(deliveryPointState(point(), now)).toBe('silent');
  });

  it('подтверждение от клиента считается за жизнь без единого успеха', () => {
    expect(deliveryPointState(point({ lastSeenAt: ago(day) }), now)).toBe(
      'alive',
    );
  });

  it('пометка важнее прочего: администратор должен видеть именно её', () => {
    expect(
      deliveryPointState(
        point({ lastSuccessAt: ago(day), deadSince: ago(day) }),
        now,
      ),
    ).toBe('dead');
  });
});
