import { SignalSendQueue } from './call-signal-send-queue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('SignalSendQueue', () => {
  it('запускает задачи строго по порядку постановки, не по порядку разрешения', async () => {
    const queue = new SignalSendQueue();
    const order: string[] = [];
    const first = deferred<void>();
    const second = deferred<void>();

    const p1 = queue.enqueue(async () => {
      order.push('start-1');
      await first.promise;
      order.push('end-1');
    });
    const p2 = queue.enqueue(async () => {
      order.push('start-2');
      await second.promise;
      order.push('end-2');
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['start-1']);

    second.resolve();
    await Promise.resolve();
    expect(order).toEqual(['start-1']);

    first.resolve();
    await p1;
    await p2;
    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('падение одной задачи не рвёт очередь — следующая всё равно стартует', async () => {
    const queue = new SignalSendQueue();
    const order: string[] = [];

    const p1 = queue
      .enqueue(async () => {
        order.push('task-1');
        throw new Error('boom');
      })
      .catch(() => undefined);
    const p2 = queue.enqueue(async () => {
      order.push('task-2');
    });

    await p1;
    await p2;
    expect(order).toEqual(['task-1', 'task-2']);
  });

  it('возвращает вызывающему коду собственный результат/ошибку задачи', async () => {
    const queue = new SignalSendQueue();

    await expect(queue.enqueue(async () => 42)).resolves.toBe(42);
    await expect(
      queue.enqueue(async () => {
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');
    await expect(queue.enqueue(async () => 'ok')).resolves.toBe('ok');
  });

  it('пустая очередь — задача выполняется немедленно (следующим микротаском)', async () => {
    const queue = new SignalSendQueue();
    const task = jest.fn().mockResolvedValue(undefined);

    await queue.enqueue(task);

    expect(task).toHaveBeenCalledTimes(1);
  });
});
