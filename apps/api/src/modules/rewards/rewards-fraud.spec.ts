import {
  detectSelfInvite,
  emailIdentity,
  type SignupSignals,
} from './rewards-fraud';

const BASE: SignupSignals = {
  userId: 'inviter',
  email: 'ivan@gmail.com',
  ip: '10.0.0.1',
  deviceId: 'device-1',
  registeredAt: new Date('2026-08-01T10:00:00.000Z'),
};

function invitee(patch: Partial<SignupSignals> = {}): SignupSignals {
  return {
    userId: 'invitee',
    email: 'petr@yandex.ru',
    ip: '10.0.0.2',
    deviceId: 'device-2',
    registeredAt: new Date('2026-08-01T12:00:00.000Z'),
    ...patch,
  };
}

describe('emailIdentity', () => {
  it('срезает плюс-адресацию', () => {
    expect(emailIdentity('ivan+ref2@gmail.com')).toBe('ivan@gmail.com');
    expect(emailIdentity(' IVAN+A+B@Gmail.COM ')).toBe('ivan@gmail.com');
  });

  // Точки значимы у большинства провайдеров: сводя их, мы объявили бы
  // однофамильцев в корпоративном домене одним человеком.
  it('не трогает точки в локальной части', () => {
    expect(emailIdentity('i.vanov@company.ru')).toBe('i.vanov@company.ru');
  });

  it('не разваливается на мусоре без @', () => {
    expect(emailIdentity('не-почта')).toBe('не-почта');
    expect(emailIdentity('+ref@mail.ru')).toBe('+ref@mail.ru');
  });
});

describe('detectSelfInvite', () => {
  it('пропускает разных людей без общих следов', () => {
    expect(detectSelfInvite(BASE, invitee())).toBeNull();
  });

  it('ловит переход по собственной ссылке', () => {
    expect(detectSelfInvite(BASE, invitee({ userId: 'inviter' }))).toBe(
      'self_invite',
    );
  });

  it('ловит плюс-адрес той же почты', () => {
    expect(detectSelfInvite(BASE, invitee({ email: 'ivan+2@gmail.com' }))).toBe(
      'email_alias',
    );
  });

  it('ловит то же устройство', () => {
    expect(detectSelfInvite(BASE, invitee({ deviceId: 'device-1' }))).toBe(
      'device_match',
    );
  });

  it('ловит тот же IP в пределах суток', () => {
    expect(detectSelfInvite(BASE, invitee({ ip: '10.0.0.1' }))).toBe(
      'ip_match',
    );
  });

  // IP делят целые общежития и офисы: за пределами окна совпадение перестаёт
  // быть уликой, иначе программа не работала бы в общине с одним роутером.
  it('не считает уликой тот же IP спустя сутки', () => {
    const late = invitee({
      ip: '10.0.0.1',
      registeredAt: new Date('2026-08-03T12:00:00.000Z'),
    });
    expect(detectSelfInvite(BASE, late)).toBeNull();
  });

  it('не сравнивает отсутствующие следы между собой', () => {
    const noSignals = invitee({ ip: null, deviceId: null });
    expect(
      detectSelfInvite({ ...BASE, ip: null, deviceId: null }, noSignals),
    ).toBeNull();
  });

  it('называет самую сильную улику, когда совпало несколько', () => {
    const twin = invitee({ email: 'ivan+x@gmail.com', deviceId: 'device-1' });
    expect(detectSelfInvite(BASE, twin)).toBe('email_alias');
  });
});
