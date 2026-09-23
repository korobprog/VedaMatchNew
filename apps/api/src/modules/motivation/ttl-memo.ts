/**
 * Память на короткое время для ответов, одинаковых у всех читателей.
 *
 * Заведена под список авторов и источников фильтра ленты (VED-252,
 * «кнопка со значком фильтра открывается с затормаживанием»): ответ
 * `/motivation/feed/attributions` не зависит от того, кто спрашивает, а
 * считается двумя парами `groupBy` по всей видимой ленте плюс двумя
 * выборками написаний. Каждый, кто открывал фильтр, запускал это заново.
 *
 * Правила:
 * - ответ живёт `ttlMs`, потом считается заново — счётчики меняются, когда
 *   в ленте появляется новое;
 * - одинаковые запросы, пришедшие одновременно, склеиваются в один расчёт;
 * - ошибка не запоминается: следующий запрос пробует снова;
 * - число ключей ограничено: фильтр по автору и источнику — свободная
 *   строка из адреса, и без предела память росла бы от любого перебора.
 */
export class TtlMemo<T> {
  private readonly data = new Map<string, { value: T; at: number }>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxKeys: number,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = this.data.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    if (hit) this.data.delete(key);
    const running = this.inFlight.get(key);
    if (running) return running;
    const request = compute()
      .then((value) => {
        // Самый старый ключ уходит первым: `Map` помнит порядок вставки.
        if (this.data.size >= this.maxKeys) {
          const oldest = this.data.keys().next().value as string | undefined;
          if (oldest !== undefined) this.data.delete(oldest);
        }
        this.data.set(key, { value, at: this.now() });
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, request);
    return request;
  }

  get size(): number {
    return this.data.size;
  }
}
