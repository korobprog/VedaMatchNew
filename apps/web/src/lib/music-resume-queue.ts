/**
 * Очередь, с которой продолжать прослушивание (VED-70).
 *
 * Сервер хранит очередь целиком (`MusicPlaybackStateDto.queue`), но и
 * карточка «Продолжить» на главной, и восстановление плеера на другом
 * устройстве брали из неё одну текущую запись. Кнопки «предыдущая» и
 * «следующая» после этого были мертвы: соседей в очереди из одной записи нет.
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
