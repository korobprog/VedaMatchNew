import {
  decreaseUnreadCount,
  resetUnreadCount,
  setUnreadCount,
  subscribeUnreadCount,
  unreadCount,
} from './unread-store';

beforeEach(() => {
  resetUnreadCount();
});

describe('unread-store', () => {
  it('начинает с нуля', () => {
    expect(unreadCount()).toBe(0);
  });

  it('хранит число от сервера и будит подписчиков', () => {
    const listener = jest.fn();
    subscribeUnreadCount(listener);
    setUnreadCount(7);
    expect(unreadCount()).toBe(7);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('то же значение никого не будит: лишняя отрисовка списка ни к чему', () => {
    const listener = jest.fn();
    subscribeUnreadCount(listener);
    setUnreadCount(3);
    setUnreadCount(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('отрицательное и дробное обрезается, мусор даёт ноль', () => {
    setUnreadCount(-5);
    expect(unreadCount()).toBe(0);
    setUnreadCount(2.9);
    expect(unreadCount()).toBe(2);
    setUnreadCount(Number.NaN);
    expect(unreadCount()).toBe(0);
  });

  it('открыли уведомление — значок гаснет сразу, не дожидаясь сервера', () => {
    setUnreadCount(2);
    decreaseUnreadCount();
    expect(unreadCount()).toBe(1);
    decreaseUnreadCount();
    decreaseUnreadCount();
    // Ниже нуля не уходим: иначе следующий `setUnreadCount` от сервера
    // «прибавил» бы значок из минуса.
    expect(unreadCount()).toBe(0);
  });

  it('отписка работает', () => {
    const listener = jest.fn();
    const off = subscribeUnreadCount(listener);
    off();
    setUnreadCount(4);
    expect(listener).not.toHaveBeenCalled();
  });
});
