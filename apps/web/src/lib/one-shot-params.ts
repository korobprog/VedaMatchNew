/**
 * Разовые параметры адреса, которым не место в истории переходов (VED-500).
 *
 * Уведомление «Работы» ведёт на `/work/planner/<среда>?task=VED-42`: открой
 * эту задачу. Доска открывает её и убирает ключ из адреса, но окна портала
 * (VED-118) и «История» (VED-392) успевали записать адрес вместе с ключом —
 * и «назад» по окну или пункт истории открывали уже закрытую задачу снова.
 * Поэтому в историю адрес попадает без разового параметра: вернуться в
 * планировщик — значит вернуться на доску, а не в ту задачу.
 */
const ONE_SHOT: ReadonlyArray<{ prefix: string; params: readonly string[] }> = [
  { prefix: "/work/planner/", params: ["task"] },
];

export function withoutOneShotParams(url: string): string {
  const rule = ONE_SHOT.find(({ prefix }) => url.startsWith(prefix));
  if (!rule) return url;
  const at = url.indexOf("?");
  if (at < 0) return url;
  const hashAt = url.indexOf("#", at);
  const query = hashAt < 0 ? url.slice(at + 1) : url.slice(at + 1, hashAt);
  const hash = hashAt < 0 ? "" : url.slice(hashAt);
  const params = new URLSearchParams(query);
  let changed = false;
  for (const name of rule.params) {
    if (params.has(name)) {
      params.delete(name);
      changed = true;
    }
  }
  if (!changed) return url;
  const rest = params.toString();
  return `${url.slice(0, at)}${rest ? `?${rest}` : ""}${hash}`;
}
