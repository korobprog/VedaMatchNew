import { sendWithRetry } from './call-signal-retry';

const noWait = () => Promise.resolve();

describe('sendWithRetry', () => {
  it('успех с первой попытки — send вызван один раз, wait не вызывается', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const wait = jest.fn().mockResolvedValue(undefined);

    const result = await sendWithRetry(send, [300, 900], wait);

    expect(result).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('первая попытка падает, вторая — успех: пауза выдержана один раз', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce(undefined);
    const wait = jest.fn().mockResolvedValue(undefined);

    const result = await sendWithRetry(send, [300, 900], wait);

    expect(result).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(300);
  });

  it('все попытки исчерпаны — false, без исключения наружу', async () => {
    const send = jest.fn().mockRejectedValue(new Error('503'));
    const wait = jest.fn().mockResolvedValue(undefined);

    const result = await sendWithRetry(send, [300, 900], wait);

    expect(result).toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 300);
    expect(wait).toHaveBeenNthCalledWith(2, 900);
  });

  it('пустой список задержек — ровно одна попытка', async () => {
    const send = jest.fn().mockRejectedValue(new Error('503'));

    const result = await sendWithRetry(send, [], noWait);

    expect(result).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('без явных аргументов использует дефолтный график задержек', async () => {
    const send = jest.fn().mockRejectedValue(new Error('503'));
    const wait = jest.fn().mockResolvedValue(undefined);

    await sendWithRetry(send, undefined, wait);

    expect(wait).toHaveBeenCalledTimes(2);
  });
});
