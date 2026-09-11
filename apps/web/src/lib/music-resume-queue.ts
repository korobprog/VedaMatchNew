/**
 * Очередь, с которой продолжать прослушивание (VED-70).
 *
 * Карточка «Продолжить» на главной и восстановление плеера на другом
 * устройстве брали из состояния сервера одну текущую запись. Кнопки
 * «предыдущая» и «следующая» после этого были мертвы: соседей в очереди из
 * одной записи нет. До VED-88 сервер очередь и не хранил — поле
 * `MusicPlaybackStateDto.queue` приходило пустым, — теперь хранит.
 *
 * Теперь очередь восстанавливается целиком, если текущая запись в ней есть.
 * Нет — значит, очередь осталась от чего-то другого, и честнее начать с
 * одной записи, чем играть «следующую» из чужого списка.
 */
export function resumeQueue(
  trackId: string,
  queue: readonly unknown[] | null | undefined,
): { queue: string[]; index: number } {
  const list = (queue ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const index = list.indexOf(trackId);
  return index >= 0
    ? { queue: list, index }
    : { queue: [trackId], index: 0 };
}

/**
 * Соседняя запись сохранённой очереди: `-1` — предыдущая, `1` — следующая
 * (VED-88). Нужна карточке на главной, пока плеер запись ещё не поднял —
 * например, полосу плеера закрыли: «назад» и «вперёд» тогда запускают соседа,
 * а не молчат.
 */
export function resumeNeighbour(
  trackId: string,
  queue: readonly unknown[] | null | undefined,
  direction: -1 | 1,
): string | null {
  const { queue: list, index } = resumeQueue(trackId, queue);
  return list[index + direction] ?? null;
}
