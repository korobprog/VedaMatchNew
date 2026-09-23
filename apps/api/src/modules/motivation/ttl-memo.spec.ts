import { TtlMemo } from './ttl-memo';

describe('TtlMemo', () => {
  it('второй запрос в пределах срока не считает заново', async () => {
    let now = 0;
    const memo = new TtlMemo<number>(1000, 10, () => now);
    const compute = jest.fn().mockResolvedValue(7);

    expect(await memo.get('k', compute)).toBe(7);
    now = 999;
    expect(await memo.get('k', compute)).toBe(7);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('по истечении срока считает заново', async () => {
    let now = 0;
    const memo = new TtlMemo<number>(1000, 10, () => now);
    const compute = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await memo.get('k', compute)).toBe(1);
    now = 1000;
    expect(await memo.get('k', compute)).toBe(2);
  });

  it('одновременные запросы склеивает в один расчёт', async () => {
    const memo = new TtlMemo<number>(1000, 10);
    let resolve!: (value: number) => void;
    const compute = jest.fn(
      () => new Promise<number>((done) => (resolve = done)),
    );

    const first = memo.get('k', compute);
    const second = memo.get('k', compute);
    resolve(5);

    expect(await Promise.all([first, second])).toEqual([5, 5]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('ошибку не запоминает', async () => {
    const memo = new TtlMemo<number>(1000, 10);
    const compute = jest
      .fn()
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce(3);

    await expect(memo.get('k', compute)).rejects.toThrow('db');
    expect(await memo.get('k', compute)).toBe(3);
  });

  it('держит не больше заданного числа ключей, вытесняя самый старый', async () => {
    const memo = new TtlMemo<string>(1000, 2);
    const compute = jest.fn((key: string) => Promise.resolve(key));

    await memo.get('a', () => compute('a'));
    await memo.get('b', () => compute('b'));
    await memo.get('c', () => compute('c'));
    expect(memo.size).toBe(2);

    await memo.get('a', () => compute('a'));
    // «a» вытеснен третьим ключом — посчитан второй раз.
    expect(compute.mock.calls.filter(([key]) => key === 'a')).toHaveLength(2);
  });
});
