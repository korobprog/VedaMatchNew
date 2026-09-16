import { singleFlight } from './single-flight';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('singleFlight', () => {
  it('одновременные вызовы ждут одно выполнение', async () => {
    const gate = deferred<string>();
    const run = jest.fn(() => gate.promise);
    const refresh = singleFlight(run);

    const first = refresh();
    const second = refresh();
    const third = refresh();
    gate.resolve('token-2');

    await expect(Promise.all([first, second, third])).resolves.toEqual(['token-2', 'token-2', 'token-2']);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('после завершения следующий вызов запускает новое выполнение', async () => {
    let n = 0;
    const refresh = singleFlight(async () => `token-${++n}`);

    await expect(refresh()).resolves.toBe('token-1');
    await expect(refresh()).resolves.toBe('token-2');
  });

  it('ошибка достаётся всем ожидающим и не залипает', async () => {
    const gate = deferred<string>();
    const run = jest.fn(() => gate.promise);
    const refresh = singleFlight(run);

    const first = refresh();
    const second = refresh();
    gate.reject(new Error('401'));
    await expect(first).rejects.toThrow('401');
    await expect(second).rejects.toThrow('401');

    run.mockImplementation(() => Promise.resolve('token-3'));
    await expect(refresh()).resolves.toBe('token-3');
    expect(run).toHaveBeenCalledTimes(2);
  });
});
