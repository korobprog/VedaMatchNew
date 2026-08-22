/**
 * Ссылки на файлы переписки подписываются на чтении.
 *
 * Бакет закрыт политикой — это осознанно: переписка не должна раздаваться
 * всем, кто угадал адрес, в отличие от картинок объявлений и Рынка, которые
 * кладутся с публичным ACL. Но прямая ссылка на закрытый объект отвечает 403,
 * и в переписке вместо фотографии оставалось пустое облачко, а голосовое
 * молчало. Поэтому перед выдачей наружу каждый адрес нашего бакета меняется
 * на подписанный.
 *
 * Логика обхода вынесена отдельно от S3 и Nest: подписывать нечего, пока не
 * известно, что именно в ответе — а это чистая работа со структурой.
 */

/** Все адреса нашего хранилища, встреченные в ответе. Без повторов. */
export function collectStorageUrls(payload: unknown, prefix: string): string[] {
  const found = new Set<string>();
  walk(payload, (value) => {
    if (value.startsWith(prefix)) found.add(value);
  });
  return [...found];
}

/**
 * Копия ответа, где найденные адреса заменены подписанными. Именно копия:
 * строки в исходных объектах могут быть общими с кешем Prisma, и править их
 * на месте — значит менять то, что нам не принадлежит.
 */
export function replaceStorageUrls(
  payload: unknown,
  signed: ReadonlyMap<string, string>,
): unknown {
  if (typeof payload === 'string') return signed.get(payload) ?? payload;
  if (Array.isArray(payload))
    return payload.map((item) => replaceStorageUrls(item, signed));
  if (isPlainObject(payload)) {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload))
      copy[key] = replaceStorageUrls(value, signed);
    return copy;
  }
  return payload;
}

function walk(value: unknown, visit: (found: string) => void): void {
  if (typeof value === 'string') return visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) walk(item, visit);
  }
}

/**
 * Только простые объекты: даты, Buffer и прочее обходить нечего, а копировать
 * их поэлементно — значит их испортить.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
